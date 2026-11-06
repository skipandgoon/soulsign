# soulsign

这是 `soulsign-chrome` 的后续维护版本。

原项目地址：

- `keg1255/soulsign-chrome`：https://github.com/keg1255/soulsign-chrome

## 上游：Manifest V3 适配

- `wuliang365702/soulsign`：https://github.com/wuliang365702/soulsign

原项目基于 `Manifest V2`，当前 Chromium 内核浏览器已不再支持 `Manifest V2`。该仓库在原项目基础上完成 `Manifest V2` → `Manifest V3` 的适配与维护，本项目基于该 fork 继续开发。

## 本仓库（个人自用，纯AI修改）

- `skipandgoon/soulsign`：https://github.com/skipandgoon/soulsign

主要更新事项：

- **2.7.x**：移除对第三方脚本推荐站点的依赖，改为读取自有脚本仓库的 `manifest.json`
- **2.8.1**
  - 脚本仓库：以卡片形式展示仓库内的签到脚本（脚本名 / 作者 / 更新时间），支持一键导入安装与更新
  - 仓库弹窗宽度为屏幕 75%，卡片固定等宽列（宽屏 4 / 中屏 3 / 窄屏 2 / 手机 1），列间距与弹窗左右内边距一致
  - 「源码」入口指向本项目仓库
  - 脚本列表支持多选（含一键全选），可批量启用、停用、删除；批量操作为即时响应
  - 脚本列表支持拖动排序（左侧专用手柄），顺序保存在本地配置中
  - 界面宽度按屏幕 75% 自适应；分辨率低于 1920×1080 时才出现横向滚动条
  - 每个 tag 自动构建 zip 并挂到 Release，便于解压后直接加载

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
v2.8.1
```
