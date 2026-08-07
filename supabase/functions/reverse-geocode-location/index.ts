import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readableLocation(data: Record<string, unknown>) {
  const address = (data.address ?? {}) as Record<string, string | undefined>;
  const locality = address.city ?? address.town ?? address.village ?? address.hamlet;
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const parts = [street, locality, address.state, address.postcode, address.country].filter(Boolean);
  return [...new Set(parts)].join(", ") || String(data.display_name ?? "").trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid token" }, 401);

    const body = (await req.json()) as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return json({ error: "Valid latitude and longitude are required" }, 400);
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude.toString());
    url.searchParams.set("lon", longitude.toString());
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "MC-Labor-Sources/1.0 (admin location display)",
      },
    });
    if (!response.ok) {
      console.error("Reverse geocoding failed", {
        status: response.status,
        latitude,
        longitude,
      });
      return json({ label: null }, 200);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return json({ label: readableLocation(data) });
  } catch (error) {
    console.error("Reverse geocoding error", error);
    // GPS coordinates remain visible in the UI when the external lookup is unavailable.
    return json({ label: null });
  }
});
