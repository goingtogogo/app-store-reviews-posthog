export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new Error(`Failed to parse JSON response: ${body}`, { cause });
  }
}
