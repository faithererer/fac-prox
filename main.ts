// 【最终修正版】
// 不再需要从 deno/std 导入 serve
// import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// --- 配置 (这部分不变) ---
const ANTHROPIC_TARGET_URL = Deno.env.get("ANTHROPIC_TARGET_URL") || "https://app.factory.ai/api/llm/a/v1/messages";
const OPENAI_TARGET_URL = Deno.env.get("OPENAI_TARGET_URL") || "https://app.factory.ai/api/llm/o/v1/responses";
const BEDROCK_TARGET_URL = Deno.env.get("BEDROCK_TARGET_URL") || "https://app.factory.ai/api/llm/a/v1/messages";

// --- 核心处理逻辑 (这部分完全不变) ---

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

async function handleAnthropicRequest(req: Request, requestUrl: URL): Promise<Response> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "x-api-key header is required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const bearerToken = apiKey;
  const targetUrl = new URL(ANTHROPIC_TARGET_URL);
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.delete("x-api-key");
  forwardedHeaders.set("Authorization", `Bearer ${bearerToken}`);
  forwardedHeaders.set("host", targetUrl.host);
  console.log(`[Proxy] 转发 Anthropic 请求到: ${targetUrl.toString()}`);
  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      body: req.body,
      redirect: "manual",
    });
    return response;
  } catch (error) {
    console.error(`[Proxy] 转发 Anthropic 请求失败:`, error);
    return new Response(JSON.stringify({ error: "Bad Gateway", details: error.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleBedrockRequest(req: Request, requestUrl: URL): Promise<Response> {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "x-api-key header is required" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
    const bearerToken = apiKey;
    const targetUrl = new URL(BEDROCK_TARGET_URL);
    const forwardedHeaders = new Headers(req.headers);
    forwardedHeaders.delete("x-api-key");
    forwardedHeaders.set("Authorization", `Bearer ${bearerToken}`);
    forwardedHeaders.set("x-model-provider", "bedrock");
    forwardedHeaders.set("host", targetUrl.host);
    console.log(`[Proxy] 转发 Bedrock 请求到: ${targetUrl.toString()}`);
    try {
        const response = await fetch(targetUrl.toString(), {
            method: req.method,
            headers: forwardedHeaders,
            body: req.body,
            redirect: "manual",
        });
        return response;
    } catch (error) {
        console.error(`[Proxy] 转发 Bedrock 请求失败:`, error);
        return new Response(JSON.stringify({ error: "Bad Gateway", details: error.message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
        });
    }
}

async function handleOpenAIRequest(req: Request, requestUrl: URL): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authorization header is required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  let requestBody = null;
  if (req.body && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const bodyData = JSON.parse(bodyText);
        if (bodyData.model === "gpt-5") {
          bodyData.model = "gpt-5-2025-08-07";
          console.log("[Proxy] 模型 gpt-5 已替换为 gpt-5-2025-08-07");
        }
        if (bodyData.model === "gpt-5-codex" && bodyData.reasoning && bodyData.reasoning.effort) {
          delete bodyData.reasoning.effort;
          console.log("[Proxy] 已移除 gpt-5-codex 模型的 reasoning.effort 字段");
        }
        requestBody = JSON.stringify(bodyData);
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  const targetUrl = new URL(OPENAI_TARGET_URL);
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("host", targetUrl.host);
  if (requestBody) {
    forwardedHeaders.set("Content-Length", new TextEncoder().encode(requestBody).length.toString());
  }
  console.log(`[Proxy] 转发 OpenAI 请求到: ${targetUrl.toString()}`);
  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      body: requestBody || req.body,
      redirect: "manual",
    });
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
console.log(`🚀 代理服务器已启动，准备接收 Deno Deploy 的请求...`);
console.log(`➡️  Anthropic 请求将转发到: ${ANTHROPIC_TARGET_URL}`);
console.log(`➡️  OpenAI 请求将转发到: ${OPENAI_TARGET_URL}`);
console.log(`➡️  Bedrock 请求将转发到: ${BEDROCK_TARGET_URL}`);

// 使用 Deno 内置的 serve API，这是在 Deno Deploy 上部署的正确方式
Deno.serve(handler);
