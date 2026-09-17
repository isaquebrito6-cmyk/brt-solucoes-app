const ADMIN_EMAIL = "ipbisaque@gmail.com";

const DEFAULT_PROFESSIONALS = [
  { nome: "Profissional responsável", tel: "41991187943", esp: "Elétrica, hidráulica e manutenção geral", pin: "0000" },
];

const DEFAULT_CONFIG = {
  whatsapp: "5541991187943",
  pix: "",
  horario: "Seg a Sáb, 8h às 18h",
  cidades: "Curitiba, São José dos Pinhais, Colombo, Pinhais, Araucária, Campo Largo, Fazenda Rio Grande, Almirante Tamandaré, Piraquara",
};

async function getAll(env) {
  const professionals = (await env.BRT_DATA.get("professionals", "json")) ?? DEFAULT_PROFESSIONALS;
  const requests = (await env.BRT_DATA.get("requests", "json")) ?? [];
  const config = (await env.BRT_DATA.get("config", "json")) ?? DEFAULT_CONFIG;
  return { professionals, requests, config };
}

function isAdmin(body) {
  return typeof body?.adminEmail === "string" && body.adminEmail.trim().toLowerCase() === ADMIN_EMAIL;
}

async function checkRateLimit(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `ratelimit:${ip}`;
  const count = parseInt((await env.BRT_DATA.get(key)) || "0", 10);
  if (count >= 5) return false;
  await env.BRT_DATA.put(key, String(count + 1), { expirationTtl: 600 });
  return true;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method;

  try {
    if (method === "GET" && path.length === 0) {
      return Response.json(await getAll(env));
    }

    if (method === "POST" && path[0] === "requests") {
      const body = await request.json();
      // Honeypot: bots fill hidden fields humans never see. Pretend success, save nothing.
      if (body.website) {
        return Response.json({ ok: true, item: { id: "0", status: "Novo" } });
      }
      const allowed = await checkRateLimit(env, request);
      if (!allowed) {
        return new Response("Too many requests, try again later", { status: 429 });
      }
      const data = await getAll(env);
      const foto = typeof body.foto === "string" && body.foto.startsWith("data:image/") ? body.foto.slice(0, 900000) : "";
      const item = {
        id: Date.now().toString(),
        nome: String(body.nome || "").slice(0, 200),
        tel: String(body.tel || "").slice(0, 40),
        cidade: String(body.cidade || "").slice(0, 100),
        endereco: String(body.endereco || "").slice(0, 300),
        servico: String(body.servico || "").slice(0, 150),
        desc: String(body.desc || "").slice(0, 1000),
        horario: String(body.horario || "").slice(0, 50),
        foto,
        status: "Novo",
        pago: false,
        criadoEm: new Date().toISOString(),
      };
      data.requests.unshift(item);
      await env.BRT_DATA.put("requests", JSON.stringify(data.requests));
      return Response.json({ ok: true, item });
    }

    if (method === "PATCH" && path[0] === "requests" && path[1]) {
      const body = await request.json();
      const data = await getAll(env);
      const item = data.requests.find((r) => r.id === path[1]);
      if (!item) return new Response("Not found", { status: 404 });
      if (typeof body.status === "string") item.status = body.status;
      if (typeof body.pago === "boolean") item.pago = body.pago;
      await env.BRT_DATA.put("requests", JSON.stringify(data.requests));
      return Response.json({ ok: true, item });
    }

    if (method === "POST" && path[0] === "professionals") {
      const body = await request.json();
      if (!isAdmin(body)) return new Response("Forbidden", { status: 403 });
      const data = await getAll(env);
      data.professionals.push({
        nome: String(body.nome || "").slice(0, 150),
        tel: String(body.tel || "").slice(0, 40),
        esp: String(body.esp || "").slice(0, 200),
        pin: String(body.pin || "0000").slice(0, 10),
      });
      await env.BRT_DATA.put("professionals", JSON.stringify(data.professionals));
      return Response.json({ ok: true, professionals: data.professionals });
    }

    if (method === "DELETE" && path[0] === "professionals" && path[1] !== undefined) {
      const body = await request.json().catch(() => ({}));
      if (!isAdmin(body)) return new Response("Forbidden", { status: 403 });
      const idx = parseInt(path[1], 10);
      const data = await getAll(env);
      if (Number.isInteger(idx) && idx >= 0 && idx < data.professionals.length) {
        data.professionals.splice(idx, 1);
        await env.BRT_DATA.put("professionals", JSON.stringify(data.professionals));
      }
      return Response.json({ ok: true, professionals: data.professionals });
    }

    if (method === "POST" && path[0] === "config") {
      const body = await request.json();
      if (!isAdmin(body)) return new Response("Forbidden", { status: 403 });
      const config = {
        whatsapp: String(body.whatsapp || "").replace(/\D/g, "").slice(0, 20),
        horario: String(body.horario || "").slice(0, 100),
        pix: String(body.pix || "").slice(0, 200),
        cidades: String(body.cidades || "").slice(0, 500),
      };
      await env.BRT_DATA.put("config", JSON.stringify(config));
      return Response.json({ ok: true, config });
    }

    return new Response("Not found", { status: 404 });
  } catch (err) {
    return new Response("Server error", { status: 500 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return handleApi(request, env);
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      return new Response(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada — BRT Soluções</title>
        <style>body{font-family:Inter,sans-serif;background:#F6F4EF;color:#12233B;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
        .box{max-width:360px;}h1{font-family:'Barlow Condensed',sans-serif;font-size:28px;margin-bottom:8px;}
        a{display:inline-block;margin-top:18px;background:#F0730B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:700;}</style></head>
        <body><div class="box"><h1>Página não encontrada</h1><p>Esse link não existe ou foi movido.</p><a href="/">Voltar para o início</a></div></body></html>`,
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    const secured = new Response(res.body, res);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "SAMEORIGIN");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return secured;
  },
};
