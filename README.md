# CPA <==> sub2api

纯前端网页工具，用来在 CPA（CLIProxyApi）认证文件和 sub2api 配置之间做双向转换。

支持两个方向：

- `CPA -> sub2api`
- `sub2api -> CPA`

## 界面预览

![CPA to sub2api 界面预览](./cpa2sub2api.png)
![sub2api to CPA 界面预览](./sub2api2cpa.png)

## 在线使用

### [**》》 点我直接使用 《《**](https://gtxx3600.github.io/CPA2sub2API/)

## 特性

- 支持 `CPA -> sub2api` 与 `sub2api -> CPA` 双向转换
- 浏览器本地完成解析和转换，不调用任何接口
- 支持拖拽多个 `*.json` 文件
- 支持目录导入
- 支持 `codex`、`claude`、`antigravity`、`gemini`
- 页面内可一键切换两个转换方向
- 支持整页翻转切换模式
- 可导出拆分后的单文件结果
- `CPA -> sub2api` 支持下载合并后的 JSON
- `CPA -> sub2api` 的单文件导出在结果超过 3 个时会自动打成 ZIP 包
- `sub2api -> CPA` 支持下载包含多个 CPA 文件的 ZIP 包

## 双向转换

- `CPA -> sub2api`：将 CPA 认证 JSON 转成 sub2api 可导入配置，并支持下载合并后的 `sub2api-YYYY-MM-DD_HH-mm-ss.json`
- `sub2api -> CPA`：将 sub2api 配置中的账号拆回多个 CPA 单文件，并支持下载 `cpa-YYYY-MM-DD_HH-mm-ss.zip`

## 转换约定

- CPA 中拿不到的字段直接省略
- `CPA -> sub2api` 导出的每个 `account` 默认包含：
  - `concurrency: 10`
  - `priority: 1`
- `sub2api -> CPA` 目前只处理可映射为 CPA OAuth 文件的账号
- `sub2api -> CPA` 不再导出合并 JSON，批量下载时会生成 ZIP 包

## 仓库结构

- `docs/index.html`: 页面入口
- `docs/styles.css`: 页面样式
- `docs/src/app.mjs`: 页面交互、模式切换和导出逻辑
- `docs/src/converter.mjs`: 双向转换逻辑
- `docs/.nojekyll`: GitHub Pages 静态部署辅助文件

## 本地预览

直接打开 `docs/index.html` 即可使用。

如果你想用更稳定的本地静态服务，可以执行：

```bash
cd docs
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`
