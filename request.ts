export class RequestError extends Error {
  status: number

  constructor(res: Response) {
    super(res.statusText)
    this.status = res.status
  }
}

export async function request(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init)
  if (!res.ok) {
    throw new RequestError(res)
  }
  return res
}
