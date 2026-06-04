export async function subscribeToMailerLite(
  email: string,
  name?: string
): Promise<void> {
  const key = process.env.MAILERLITE_API_KEY;
  if (!key) return;

  try {
    const body: Record<string, unknown> = { email };
    if (name) body.fields = { name };

    const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`MailerLite subscribe failed (${res.status}):`, text);
    }
  } catch (err) {
    console.error("MailerLite subscribe error:", err);
  }
}
