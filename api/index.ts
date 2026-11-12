import { dispatch } from "../server/bundle.mjs";

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    const route = url.searchParams.get("__ecoase_route");
    const pathname = route === "mcp" ? "/mcp" : route?.startsWith("oauth/") ? `/${route}` : route?.startsWith("well-known/") ? `/.${route}` : route ? `/api/${route}` : url.pathname;
    return dispatch(request, pathname);
  },
};
