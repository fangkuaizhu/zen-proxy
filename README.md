# Zen Proxy

本地代理，将 OpenAI 兼容请求转发到 [OpenCode Zen](https://opencode.ai) 的免费 API（DeepSeek V4 Flash Free 等）。

## 架构

```
你的应用 → http://127.0.0.1:5678/v1/chat/completions
                ↓ (本代理)
           https://opencode.ai/zen/v1/chat/completions
                ↓
           DeepSeek V4 Flash Free / 其他免费模型
```

## 支持的免费模型

| 模型 | 推理 | 上下文 |
|------|------|--------|
| `deepseek-v4-flash-free` | ✅ | 128K |
| `qwen3.6-plus-free` | ❌ | 128K |
| `ring-2.6-1t-free` | ❌ | 128K |
| `minimax-m2.5-free` | ❌ | 128K |
| `nemotron-3-super-free` | ❌ | 128K |
| `trinity-large-preview-free` | ❌ | 128K |

## 启动

```bash
node server.js
# 或双击 start.bat
```

## 端口

- `5678` — 代理服务（仅 127.0.0.1，无认证）

## 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 兼容的聊天补全（支持流式） |
| `/health` | GET | 健康检查 |
| `/stats` | GET | 请求统计 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `ZEN_API_KEY` | OpenCode Zen 的 API Key（默认使用编译时的 Key） |

## PM2 部署

```bash
pm2 start ecosystem.config.json
```

## Hanako 集成

在 Hanako 中将 base_url 设为 `http://127.0.0.1:5678/v1`，API 类型选 `openai-completions`。
