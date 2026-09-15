interface Env {
  BRT_DATA: KVNamespace;
}

const ADMIN_EMAIL = "ipbisaque@gmail.com";

const DEFAULT_PROFESSIONALS = [
  { nome: "Profissional responsável", tel: "41991187943", esp: "Elétrica, hidráulica e manutenção geral", pin: "0000" },
];

const DEFAULT_CONFIG = {
  whatsapp: "5541991187943",
  pix: "",
  cidades: "Curitiba, São José dos Pinhais, Colombo, Pinhais, Araucária, Campo Largo, Fazenda Rio Grande, Almirante Tamandaré, Piraquara",
};

async function getAll(env: Env) {
  const professionals = (await env.BRT_DATA.get("professionals", "json")) ?? DEFAULT_PROFESSIONALS;
  const requests = (await env.BRT_DATA.get("requests", "json")) ?? [];
  const config = (await env.BRT_DATA.get("config", "json")) ?? DEFAULT_CONFIG;
  return { professionals, requests, config };
}

function isAdmin(body: any) {
  return typeof body?.adminEmail === "string" && body.adminEmail.trim().toLowerCase() === ADMIN_EMAIL;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const path = ((params.path as string[]) || []).filter(Boolean);
  const method = request.method;

  try {
    if (method === "GET" && path.length === 0) {
      return Response.json(await getAll(env));
    }

    if (method === "POST" && path[0] === "requests") {
      const body: any = await request.json();
      const data = await getAll(env);
      const item = {
        id: Date.now().toString(),
        nome: String(body.nome || "").slice(0, 200),
        tel: String(body.tel || "").slice(0, 40),
        cidade: String(body.cidade || "").slice(0, 100),
        endereco: String(body.endereco || "").slice(0, 300),
        servico: String(body.servico || "").slice(0, 150),
        desc: String(body.desc || "").slice(0, 1000),
        horario: String(body.horario || "").slice(0, 50),
        status: "Novo",
        pago: false,
        criadoEm: new Date().toISOString(),
      };
      data.requests.unshift(item);
      await env.BRT_DATA.put("requests", JSON.stringify(data.requests));
      return Response.json({ ok: true, item });
    }

    if (method === "PATCH" && path[0] === "requests" && path[1]) {
      const body: any = await request.json();
      const data = await getAll(env);
      const item = data.requests.find((r: any) => r.id === path[1]);
      if (!item) return new Response("Not found", { status: 404 });
      if (typeof body.status === "string") item.status = body.status;
      if (typeof body.pago === "boolean") item.pago = body.pago;
      await env.BRT_DATA.put("requests", JSON.stringify(data.requests));
      return Response.json({ ok: true, item });
    }

    if (method === "POST" && path[0] === "professionals") {
      const body: any = await request.json();
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
      const body: any = await request.json().catch(() => ({}));
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
      const body: any = await request.json();
      if (!isAdmin(body)) return new Response("Forbidden", { status: 403 });
      const config = {
        whatsapp: String(body.whatsapp || "").replace(/\D/g, "").slice(0, 20),
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
};
