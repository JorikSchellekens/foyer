import "server-only";

/**
 * Cloudflare auto-configuration for custom domains.
 *
 * Given an API token with Zone.DNS edit permission, we locate the zone that
 * contains the requested domain and create a proxied CNAME pointing at this
 * deployment. Cloudflare's edge then issues the certificate automatically.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

type CfZone = { id: string; name: string };

async function cf<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ success: boolean; result: T; errors: { message: string }[] }> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  return res.json();
}

export async function findZoneForDomain(
  token: string,
  domain: string
): Promise<CfZone | null> {
  // Try each parent: files.acme.com -> acme.com
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const res = await cf<CfZone[]>(
      token,
      `/zones?name=${encodeURIComponent(candidate)}&status=active`
    );
    if (res.success && res.result.length > 0) return res.result[0];
  }
  return null;
}

export async function autoConfigureDomain(opts: {
  token: string;
  domain: string;
  target: string; // hostname this app is served from
}): Promise<
  | { ok: true; zoneId: string; recordId: string }
  | { ok: false; error: string }
> {
  const zone = await findZoneForDomain(opts.token, opts.domain);
  if (!zone)
    return {
      ok: false,
      error: `No active Cloudflare zone found for ${opts.domain}. Check the API token has Zone.DNS permission on the right account.`,
    };

  // Replace any existing record for this exact name.
  const existing = await cf<{ id: string }[]>(
    opts.token,
    `/zones/${zone.id}/dns_records?name=${encodeURIComponent(opts.domain)}`
  );
  if (existing.success) {
    for (const rec of existing.result) {
      await cf(opts.token, `/zones/${zone.id}/dns_records/${rec.id}`, {
        method: "DELETE",
      });
    }
  }

  const created = await cf<{ id: string }>(
    opts.token,
    `/zones/${zone.id}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: opts.domain,
        content: opts.target,
        proxied: true,
        ttl: 1,
        comment: "Managed by Foyer",
      }),
    }
  );
  if (!created.success)
    return {
      ok: false,
      error: created.errors?.[0]?.message ?? "Failed to create DNS record",
    };
  return { ok: true, zoneId: zone.id, recordId: created.result.id };
}

/** Resolve DNS via Cloudflare DoH: no sockets, works everywhere. */
export async function resolveDns(
  name: string,
  type: "CNAME" | "TXT" | "A"
): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
        name
      )}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    const json = (await res.json()) as {
      Answer?: { data: string }[];
    };
    return (json.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

export function appHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL(url).host;
}

/** A domain verifies when it CNAMEs to us, resolves through Cloudflare, or serves our health endpoint. */
export async function checkDomain(domain: string): Promise<boolean> {
  const target = appHost().split(":")[0];
  const cnames = await resolveDns(domain, "CNAME");
  if (cnames.some((c) => c.replace(/\.$/, "") === target)) return true;
  try {
    const res = await fetch(`https://${domain}/api/health`, {
      signal: AbortSignal.timeout(6000),
      redirect: "manual",
    });
    if (res.ok) {
      const json = (await res.json()) as { service?: string };
      if (json.service === "foyer") return true;
    }
  } catch {
    // fall through
  }
  return false;
}
