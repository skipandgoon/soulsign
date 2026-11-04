# soulsign

这是 `soulsign-chrome` 的后续维护版本。

原项目地址：

- `keg1255/soulsign-chrome`：https://github.com/keg1255/soulsign-chrome

## 项目说明

原作者停止维护后，我在原项目基础上继续更新这个扩展。

原项目主要基于 `Manifest V2`，但当前 Chromium 内核浏览器已经不再支持 `Manifest V2`，因此我对项目进行了后续适配与维护，使其可以继续运行在较新的浏览器版本上。

当前仓库的重点是：

- 基于原项目继续维护
- 将扩展从 `Manifest V2` 适配到 `Manifest V3`
- 持续兼容新版本浏览器
- 当前维护版本为 `2.6.1`

## 2.7.0 / 2.7.1 新增（个人自用）

- **我的脚本库**：顶部导航「我的脚本库」→ 填私有仓库（`owner/repo`）+ 分支 + PAT，
  读取仓库里的 `manifest.json`，列出「未安装 / 已装 / 可更新」，一键安装或更新（更新时保留原参数与统计）。
- **云端同步**：把 `{config, tasks}`（含 `_params`）上传为仓库里的 `sync/sync.json`，
  换机器或重装时一键恢复（按 author+name 覆盖同名脚本）。
- 原来的「脚本推荐」外链（`soulsign.inu1255.cn`）已改为指向自己的私有脚本仓库。
- 凭据只存 `chrome.storage.local`，不写进代码、不上报；界面可一键清除。

脚本库结构见 `skipandgoon/soulsign-scripts` 的 README。

**2.7.1**：脚本库仓库为公开仓库时，读取 `manifest.json` **不需要 PAT**（走 raw.githubusercontent），
只有「上传到云端 / 从云端恢复」需要 PAT。每个 tag 会自动构建 zip 并挂到 Release。

另外，当前版本的部分迁移与改动使用了 AI 辅助完成代码调整。

## 目录说明

- `manifest.json`：扩展清单文件
- `popup.html`：插件弹窗页面
- `options.html`：主要管理页面
- `offscreen.html`：offscreen 页面
- `sandbox.html`：沙箱页面
- `js/`：扩展脚本
- `icons/`：扩展图标
- `static/`：静态资源
- `tools/`：校验脚本和手工回归检查文档

## 本地加载方式

1. 打开 `chrome://extensions` 或 Edge 扩展管理页面。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目目录。

## 开发说明

- 扩展版本号定义在 `manifest.json`
- `options.html` 中展示的版本号应与 `manifest.json` 保持一致
- 修改页面或脚本后，建议检查 `tools/manual-regression-checklist.md`

## 校验

可使用 Node.js 运行仓库自带的校验脚本：

```powershell
node .\tools\verify-offscreen-pure.js
node .\tools\verify-options-pure.js
node .\tools\verify-all.js
```

## 发布版本

当前标签：

```text
v2.6.1
```
