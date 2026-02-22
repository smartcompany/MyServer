import { NextRequest, NextResponse } from "next/server";

function unauthorizedResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="LetsMeet Dashboard"',
    },
  });
}

function isValidBasicAuth(request: NextRequest, expectedUser: string, expectedPass: string) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  const encoded = authHeader.slice(6).trim();
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return false;

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);
  return user === expectedUser && pass === expectedPass;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSimulateApi = pathname === "/api/bot-control/simulate";
  const isBotConfig = pathname === "/api/bot-config";
  const internalToken = process.env.DASHBOARD_TOKEN?.trim();

  // pm2 시뮬레이터 내부 호출: x-internal-simulator 통과 (config 조회, simulate tick)
  if (internalToken && request.headers.get("x-internal-simulator") === internalToken) {
    if (isBotConfig || isSimulateApi) return NextResponse.next();
  }

  const expectedUser = process.env.DASHBOARD_BASIC_AUTH_USER;
  const expectedPass = process.env.DASHBOARD_BASIC_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return new NextResponse("Basic auth is not configured", { status: 500 });
  }

  // For bot-tick: if token is already provided, pass through unchanged.
  if (isSimulateApi && request.headers.get("x-dashboard-token")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-simulate-source", "bot-tick");
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (!isValidBasicAuth(request, expectedUser, expectedPass)) {
    return unauthorizedResponse();
  }

  if (isSimulateApi) {
    const dashboardToken = process.env.DASHBOARD_TOKEN?.trim();
    if (!dashboardToken) {
      return new NextResponse("DASHBOARD_TOKEN is not configured", { status: 500 });
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-dashboard-token", dashboardToken);
    requestHeaders.set("x-simulate-source", "dashboard-manual");
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/bot-control/simulate", "/api/bot-config"],
};
