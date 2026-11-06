// 沙箱侧 axios 出参测试：postMessage 只能传可结构化克隆的值，
// URLSearchParams 必须先序列化，否则调用会被浏览器直接打断（DataCloneError）。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.resolve(__dirname, "../js/sandbox.js");
const source = fs.readFileSync(sourcePath, "utf8");

function extractFunction(name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(source);
  if (!match) throw new Error(`Function not found: ${name}`);
  const braceIndex = source.indexOf("{", match.index);
  let depth = 0;
  let end = braceIndex;
  for (; end < source.length; end++) {
    const ch = source[end];
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  return source.slice(match.index, end);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeAxios(task) {
  const calls = [];
  const context = {
    location: { href: "chrome-extension://abcdefghijklmnop/sandbox.html" },
    URL,
    URLSearchParams,
    Object,
    Set,
    Map,
    Promise,
    String,
    Error,
    Array,
    JSON,
    callParent(rid, method, ...args) {
      calls.push({ rid, method, args });
      return Promise.resolve({ status: 200, data: "" });
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction("createAxios")}; this.createAxios = createAxios;`,
    context,
    { filename: sourcePath }
  );
  return { axios: context.createAxios(task), calls };
}

async function run() {
  const task = { domains: ["totheglory.im"], _rid: "run_7" };
  const { axios, calls } = makeAxios(task);

  // 1) URLSearchParams → 表单字符串，且不残留对象
  const params = new URLSearchParams();
  params.append("signed_timestamp", "1730000000");
  params.append("signed_token", "abc123");
  await axios.post("https://totheglory.im/signed.php", params);
  const first = calls[0].args[0];
  assert(calls[0].rid === "run_7", "rid must be forwarded");
  assert(calls[0].method === "fetch", "axios.post must go through fetch");
  assert(typeof first.body === "string", "URLSearchParams body must be serialized to string");
  assert(
    first.body === "signed_timestamp=1730000000&signed_token=abc123",
    `unexpected body: ${first.body}`
  );
  assert(
    Object.keys(first.headers).some(
      (key) => key.toLowerCase() === "content-type" &&
        first.headers[key] === "application/x-www-form-urlencoded;charset=UTF-8"
    ),
    "form content-type must be added"
  );

  // 2) 调用方显式给了 Content-Type 就不覆盖
  const params2 = new URLSearchParams({ a: "1" });
  await axios.post("https://totheglory.im/signed.php", params2, {
    headers: { "content-type": "text/plain" },
  });
  const second = calls[1].args[0];
  assert(second.headers["content-type"] === "text/plain", "explicit content-type must win");
  assert(!("Content-Type" in second.headers), "must not add a duplicate content-type");

  // 3) 普通字符串 body 原样传
  await axios.post("https://totheglory.im/signed.php", "raw=1");
  assert(calls[2].args[0].body === "raw=1", "string body must stay untouched");

  // 4) 域外请求在沙箱侧先拦掉
  let rejected = false;
  try {
    await axios.get("https://evil.com/x");
  } catch (error) {
    rejected = /domain mismatch/.test(String(error && error.message ? error.message : error));
  }
  assert(rejected, "out-of-domain axios call must be rejected");
  assert(calls.length === 3, "rejected call must not reach callParent");

  // 5) 静态检查：body 序列化必须在 callParent 之前
  const requestBody = extractFunction("createAxios");
  assert(
    requestBody.includes("body instanceof URLSearchParams") && requestBody.includes("body.toString()"),
    "createAxios must serialize URLSearchParams before postMessage"
  );

  console.log("verify-sandbox-axios: ok");
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});