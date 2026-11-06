// 权限边界回归测试：用桩 fetch/bridge 直接跑 offscreen 侧的 sandboxCall，
// 断言脚本绕过封装伪造的调用会被"按当前任务 domains/grants 复核"的口径挡住。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.resolve(__dirname, "../js/offscreen.js");
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

function assertRejects(promise, includes, message) {
  return promise.then(
    () => {
      throw new Error(`${message}: expected rejection, got resolve`);
    },
    (error) => {
      const text = String(error && error.message ? error.message : error);
      if (!text.includes(includes)) {
        throw new Error(`${message}: expected error containing "${includes}", got "${text}"`);
      }
    }
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeHarness() {
  const calls = { fetch: [], bridge: [] };
  let nextHandle = 1;
  const handles = new Map();
  const responses = [];
  const state = { tabUrl: "https://example.com/home" };

  function fetch(url, init) {
    calls.fetch.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return Promise.resolve({
      url: next.url || url,
      status: next.status || 200,
      statusText: "OK",
      headers: new Map([["content-type", "application/json"]]),
      text: () => Promise.resolve(next.body || ""),
    });
  }

  function bridge(method, args) {
    calls.bridge.push({ method, args });
    if (method === "cookies.get") return Promise.resolve({ value: "COOKIE_VALUE" });
    if (method === "cookies.set") return Promise.resolve({ value: args && args.value });
    if (method === "tabs.create") return Promise.resolve({ id: 7 });
    if (method === "tabs.waitComplete") return Promise.resolve(true);
    if (method === "tabs.get") return Promise.resolve({ url: state.tabUrl });
    if (method === "notifications.create") return Promise.resolve(true);
    if (method === "notifications.waitClick") return Promise.resolve(true);
    if (method === "tabs.remove") return Promise.resolve(true);
    if (method === "windows.remove") return Promise.resolve(true);
    if (method === "windows.create") return Promise.resolve({ id: 9 });
    if (method === "webNavigation.getAllFrames") {
      return Promise.resolve([{ frameId: 0, url: "https://example.com/home" }]);
    }
    throw new Error(`unexpected bridge: ${method}`);
  }

  const context = {
    URL,
    Set,
    Map,
    Object,
    JSON,
    Math,
    String,
    Number,
    Array,
    Promise,
    Error,
    RegExp,
    fetch,
    bridge,
    handles,
    nextHandle,
    closeTarget: () => Promise.resolve(true),
    ensureLoaded: () => Promise.resolve(true),
    evalInFrame: () => Promise.resolve("EVAL_RESULT"),
    sleep: () => Promise.resolve(),
    console,
    responses,
    calls,
    state,
  };
  vm.createContext(context);

  const names = ["checkDomain", "isHttpUrl", "assertTaskDomain", "createHandle", "sandboxCall"];
  for (const name of names) {
    const fnSource = extractFunction(name);
    vm.runInContext(`${fnSource}; this.${name} = ${name};`, context, { filename: sourcePath });
  }

  return {
    context,
    calls,
    handles,
    state,
    sandboxCall: context.sandboxCall,
    makeRun(domains, grants, rid) {
      return { rid: rid || "run_1", domains: domains || ["example.com"], grants: new Set(grants || []) };
    },
    respond(next) {
      responses.push(next);
    },
  };
}

async function run() {
  const h = makeHarness();
  const runCtx = h.makeRun(["example.com", "*.example.org"], [], "run_1");
  const runWithGrants = h.makeRun(["example.com"], ["cookie", "notify", "loadjs"], "run_2");

  // 0) 没有活动 run（伪造消息 / 过期消息）
  await assertRejects(
    h.sandboxCall({ method: "fetch", args: [{ url: "https://example.com/a" }] }, null),
    "inactive run",
    "sandboxCall without run"
  );

  // 1) 域外 fetch 必须拒绝，且不能真的发出去
  await assertRejects(
    h.sandboxCall({ method: "fetch", args: [{ url: "https://evil.com/steal" }] }, runCtx),
    "domain mismatch",
    "fetch outside declared domains"
  );
  assert(h.calls.fetch.length === 0, "fetch outside domains must not reach the network");

  // 2) 域内 fetch 正常放行
  h.respond({ body: '{"ok":true}' });
  const okFetch = await h.sandboxCall(
    { method: "fetch", args: [{ url: "https://example.com/api/checkin" }] },
    runCtx
  );
  assert(okFetch.status === 200 && okFetch.data === '{"ok":true}', "in-domain fetch should succeed");
  assert(h.calls.fetch[0].init.credentials === "include", "in-domain fetch keeps cookies");

  // 3) 通配子域按声明放行，不相关域拒绝
  h.respond({ body: "" });
  await h.sandboxCall({ method: "fetch", args: [{ url: "https://api.example.org/x" }] }, runCtx);
  await assertRejects(
    h.sandboxCall({ method: "fetch", args: [{ url: "https://example.org.evil.com/x" }] }, runCtx),
    "domain mismatch",
    "suffix-spoofed host"
  );

  // 4) 重定向到域外必须拒绝
  h.respond({ url: "https://evil.com/landing", body: "" });
  await assertRejects(
    h.sandboxCall({ method: "fetch", args: [{ url: "https://example.com/redirect" }] }, runCtx),
    "domain mismatch after redirect",
    "redirect out of domain"
  );

  // 5) getCookie / setCookie：无 grant 拒绝
  await assertRejects(
    h.sandboxCall({ method: "getCookie", args: ["https://example.com", "sid"] }, runCtx),
    "missing grant cookie",
    "getCookie without grant"
  );
  // 有 grant 但域外照样拒绝
  await assertRejects(
    h.sandboxCall({ method: "getCookie", args: ["https://evil.com", "sid"] }, runWithGrants),
    "domain mismatch",
    "getCookie outside domains"
  );
  await assertRejects(
    h.sandboxCall({ method: "setCookie", args: ["https://evil.com", "sid", "x"] }, runWithGrants),
    "domain mismatch",
    "setCookie outside domains"
  );
  const cookie = await h.sandboxCall(
    { method: "getCookie", args: ["https://example.com", "sid"] },
    runWithGrants
  );
  assert(cookie === "COOKIE_VALUE", "getCookie in domain should return value");

  // 6) notify：无 grant 拒绝
  await assertRejects(
    h.sandboxCall({ method: "notify", args: ["t", "b", ""] }, runCtx),
    "missing grant notify",
    "notify without grant"
  );

  // 7) require/loadjs：无 grant 拒绝；第三方 URL 不带 cookie
  await assertRejects(
    h.sandboxCall({ method: "fetch", args: [{ url: "https://cdn.jsdelivr.net/x.js", kind: "load" }] }, runCtx),
    "missing grant loadjs",
    "module load without grant"
  );
  h.respond({ body: "module.exports = {};" });
  await h.sandboxCall(
    { method: "fetch", args: [{ url: "https://cdn.jsdelivr.net/x.js", kind: "load" }] },
    runWithGrants
  );
  const loadCall = h.calls.fetch[h.calls.fetch.length - 1];
  assert(loadCall.init.credentials === "omit", "third-party module load must not send cookies");

  // 8) open：不采信沙箱自报的 domains（伪造 ["*"] 也打不开域外站点）
  await assertRejects(
    h.sandboxCall(
      { method: "open", args: [{ url: "https://evil.com/", domains: ["*"] }] },
      runCtx
    ),
    "invalid domain config",
    "open outside task domains must ignore forged domains"
  );

  // 9) open 成功后 handle 绑定 rid，跨 run 不可复用
  const opened = await h.sandboxCall(
    { method: "open", args: [{ url: "https://example.com/", timeout: 5000 }] },
    runCtx
  );
  assert(opened.handle && h.handles.get(opened.handle).rid === runCtx.rid, "handle should carry run id");
  await assertRejects(
    h.sandboxCall({ method: "frame.eval", args: [opened.handle, "1+1"] }, runWithGrants),
    "frame not found",
    "handle reuse across runs"
  );
  const evalValue = await h.sandboxCall(
    { method: "frame.eval", args: [opened.handle, "1+1"] },
    runCtx
  );
  assert(evalValue === "EVAL_RESULT", "frame.eval should execute for the owning run");

  // 9b) open 之后页面跳去域外：句柄还能关，但 frame.eval 必须拒绝
  h.state.tabUrl = "https://evil.com/login";
  const openedEvil = await h.sandboxCall(
    { method: "open", args: [{ url: "https://example.com/go", timeout: 5000 }] },
    runCtx
  );
  await assertRejects(
    h.sandboxCall({ method: "frame.eval", args: [openedEvil.handle, "document.cookie"] }, runCtx),
    "domain mismatch",
    "eval after cross-domain redirect"
  );
  h.state.tabUrl = "https://example.com/home";

  // 10) 静态检查：两侧消息入口都校验来源；sandbox 回包不再用通配目标
  const sandboxSource = fs.readFileSync(path.resolve(__dirname, "../js/sandbox.js"), "utf8");
  assert(
    source.includes("event.source !== iframe.contentWindow"),
    "offscreen must validate message source against its sandbox iframe"
  );
  assert(sandboxSource.includes("event.source !== parent"), "sandbox must validate message source against parent");
  assert(
    !/postMessage\([\s\S]{0,200}?,\s*"\*"\s*\)/.test(sandboxSource),
    "sandbox replies must target the extension origin instead of *"
  );
  assert(
    sandboxSource.includes("rid: rid || null"),
    "sandbox calls must carry the active run id"
  );

  console.log("verify-sandbox-guard: ok");
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});