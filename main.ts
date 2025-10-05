// Factory 用 x-api-key 转 bearer token，支持 Anthropic、OpenAI 和 Bedrock
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// v1.1
// --- 配置 ---

// 2. 定义代理服务器监听的端口
// const PROXY_PORT = parseInt(Deno.env.get("PROXY_PORT") || "8000");

// 3. 定义要将请求转发到的目标服务 URL
const ANTHROPIC_TARGET_URL = Deno.env.get("ANTHROPIC_TARGET_URL") || "https://app.factory.ai/api/llm/a/v1/messages";
const OPENAI_TARGET_URL = Deno.env.get("OPENAI_TARGET_URL") || "https://app.factory.ai/api/llm/o/v1/responses";
const BEDROCK_TARGET_URL = Deno.env.get("BEDROCK_TARGET_URL") || "https://app.factory.ai/api/llm/a/v1/messages";

// --- 核心处理逻辑 ---

async function handler(req: Request): Promise<Response> {
  const requestUrl = new URL(req.url);
  console.log(`[Proxy] 收到请求: ${req.method} ${requestUrl.pathname}`);

  // 路由判断
  if (requestUrl.pathname.startsWith('/anthropic')) {
    return handleAnthropicRequest(req, requestUrl);
  } else if (requestUrl.pathname.startsWith('/openai')) {
    return handleOpenAIRequest(req, requestUrl);
  } else if (requestUrl.pathname.startsWith('/bedrock')) {
    return handleBedrockRequest(req, requestUrl);
  } else {
    return new Response(JSON.stringify({ error: "Invalid endpoint. Use /anthropic/, /openai/, or /bedrock/" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// 处理 Anthropic 请求（原逻辑）
async function handleAnthropicRequest(req: Request, requestUrl: URL): Promise<Response> {
  // 1. 从请求头中提取 x-api-key
  const apiKey = req.headers.get("x-api-key");

  if (!apiKey) {
    console.error("[Proxy] 拒绝请求: 缺少 x-api-key 请求头");
    return new Response(JSON.stringify({ error: "x-api-key header is required" }), {
      status: 401, // Unauthorized
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. 根据 API Key 查找对应的 Bearer Token
  const bearerToken = apiKey;

  if (!bearerToken) {
    console.error(`[Proxy] 拒绝请求: 无效的 API Key: ${apiKey}`);
    return new Response(JSON.stringify({ error: "Invalid API Key" }), {
      status: 403, // Forbidden
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. 准备转发请求
  const targetUrl = new URL(ANTHROPIC_TARGET_URL);

  // 复制原始请求头，并进行修改
  const forwardedHeaders = new Headers(req.headers);
  
  // 移除旧的 x-api-key
  forwardedHeaders.delete("x-api-key");
  
  // 添加新的 Authorization 头
  forwardedHeaders.set("Authorization", `Bearer ${bearerToken}`);

  // 确保 host 头指向目标服务，fetch 会自动处理
  forwardedHeaders.set("host", targetUrl.host);

  console.log(`[Proxy] 转发 Anthropic 请求到: ${targetUrl.toString()}`);
  console.log(`[Proxy] 使用 Bearer Token: ...${bearerToken.slice(-6)}`);

  try {
    // 4. 使用 fetch 发起转发请求
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      body: req.body,
      redirect: "manual", // 避免 fetch 自动处理重定向
    });

    // 5. 将目标服务的响应直接返回给原始客户端
    return response;
    
  } catch (error) {
    console.error(`[Proxy] 转发 Anthropic 请求失败:`, error);
    return new Response(JSON.stringify({ error: "Bad Gateway", details: error.message }), {
      status: 502, // Bad Gateway
      headers: { "Content-Type": "application/json" },
    });
  }
}

// 处理 Bedrock 请求（基于 Anthropic 逻辑，添加 x-model-provider 头）
async function handleBedrockRequest(req: Request, requestUrl: URL): Promise<Response> {
  // 1. 从请求头中提取 x-api-key
  const apiKey = req.headers.get("x-api-key");

  if (!apiKey) {
    console.error("[Proxy] 拒绝请求: 缺少 x-api-key 请求头");
    return new Response(JSON.stringify({ error: "x-api-key header is required" }), {
      status: 401, // Unauthorized
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. 根据 API Key 查找对应的 Bearer Token
  const bearerToken = apiKey;

  if (!bearerToken) {
    console.error(`[Proxy] 拒绝请求: 无效的 API Key: ${apiKey}`);
    return new Response(JSON.stringify({ error: "Invalid API Key" }), {
      status: 403, // Forbidden
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. 准备转发请求
  const targetUrl = new URL(BEDROCK_TARGET_URL);

  // 复制原始请求头，并进行修改
  const forwardedHeaders = new Headers(req.headers);
  
  // 移除旧的 x-api-key
  forwardedHeaders.delete("x-api-key");
  
  // 添加新的 Authorization 头
  forwardedHeaders.set("Authorization", `Bearer ${bearerToken}`);
  
  // 添加 x-model-provider 头，标识为 bedrock
  forwardedHeaders.set("x-model-provider", "bedrock");

  // 确保 host 头指向目标服务，fetch 会自动处理
  forwardedHeaders.set("host", targetUrl.host);

  console.log(`[Proxy] 转发 Bedrock 请求到: ${targetUrl.toString()}`);
  console.log(`[Proxy] 使用 Bearer Token: ...${bearerToken.slice(-6)}`);
  console.log(`[Proxy] 添加了 x-model-provider: bedrock 头`);

  try {
    // 4. 使用 fetch 发起转发请求
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      body: req.body,
      redirect: "manual", // 避免 fetch 自动处理重定向
    });

    // 5. 将目标服务的响应直接返回给原始客户端
    return response;
    
  } catch (error) {
    console.error(`[Proxy] 转发 Bedrock 请求失败:`, error);
    return new Response(JSON.stringify({ error: "Bad Gateway", details: error.message }), {
      status: 502, // Bad Gateway
      headers: { "Content-Type": "application/json" },
    });
  }
}

// 处理 OpenAI 请求
async function handleOpenAIRequest(req: Request, requestUrl: URL): Promise<Response> {
  // 1. 检查是否有 Authorization 头
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    console.error("[Proxy] 拒绝请求: 缺少 Authorization 请求头");
    return new Response(JSON.stringify({ error: "Authorization header is required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. 处理请求体
  let requestBody = null;
  if (req.body && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const bodyData = JSON.parse(bodyText);
        
        // 模型替换逻辑
        if (bodyData.model === "gpt-5") {
          bodyData.model = "gpt-5-2025-08-07";
          console.log("[Proxy] 模型 gpt-5 已替换为 gpt-5-2025-08-07");
        }
        
        // 去除 reasoning.effort 字段
        if (bodyData.model === "gpt-5-codex" && bodyData.reasoning && bodyData.reasoning.effort) {
          delete bodyData.reasoning.effort;
          console.log("[Proxy] 已移除 gpt-5-codex 模型的 reasoning.effort 字段");
        }
        
        requestBody = JSON.stringify(bodyData);
      }
    } catch (error) {
      console.error("[Proxy] 解析请求体失败:", error);
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 3. 准备转发请求
  const targetUrl = new URL(OPENAI_TARGET_URL);

  // 复制原始请求头
  const forwardedHeaders = new Headers(req.headers);

  // 确保 host 头指向目标服务
  forwardedHeaders.set("host", targetUrl.host);

  // 更新 Content-Length 如果有修改过请求体
  if (requestBody) {
    forwardedHeaders.set("Content-Length", new TextEncoder().encode(requestBody).length.toString());
  }

  console.log(`[Proxy] 转发 OpenAI 请求到: ${targetUrl.toString()}`);
  console.log(`[Proxy] 使用 Authorization: ${authHeader.substring(0, 20)}...`);

  try {
    // 4. 使用 fetch 发起转发请求
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      body: requestBody || req.body,
      redirect: "manual",
    });

    // 5. 将目标服务的响应直接返回给原始客户端
    return response;
    
  } catch (error) {
    console.error(`[Proxy] 转发 OpenAI 请求失败:`, error);
    return new Response(JSON.stringify({ error: "Bad Gateway", details: error.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- 启动服务器 ---
console.log(`🚀 代理服务器已启动，准备接收请求...`); // 修改日志，因为我们不知道具体端口
console.log(`➡️  Anthropic 请求将转发到: ${ANTHROPIC_TARGET_URL}`);
console.log(`➡️  OpenAI 请求将转发到: ${OPENAI_TARGET_URL}`);
console.log(`➡️  Bedrock 请求将转发到: ${BEDROCK_TARGET_URL}`);
console.log(`📍 使用方法:`);
console.log(`   - /anthropic/* -> 需要 x-api-key 头 (转换为 Bearer Token)`);
console.log(`   - /openai/* -> 需要 Authorization: Bearer <token> 头 (直接透传)`);
console.log(`   - /bedrock/* -> 需要 x-api-key 头 (转换为 Bearer Token + 添加 x-model-provider: bedrock)`);

serve(handler); //  <-- 核心修改在这里！去掉第二个参数
