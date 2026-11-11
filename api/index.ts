import { dispatch } from "../server/router";

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    const route = url.searchParams.get("__ecoase_route");
    const pathname = route === "mcp" ? "/mcp" : route ? `/api/${route}` : url.pathname;
    return dispatch(request, pathname);
  },
};
