import { createContext, useContext, type ComponentProps, type MouseEvent } from "react";

export type Navigate = (href: string, replace?: boolean) => void;
const NavigationContext = createContext<Navigate | null>(null);

export const NavigationProvider = NavigationContext.Provider;

export function useNavigate(): Navigate {
  const navigate = useContext(NavigationContext);
  if (!navigate) throw new Error("Falta NavigationProvider.");
  return navigate;
}

export function AppLink({ href, onClick, children, ...props }: ComponentProps<"a"> & { href: string }) {
  const navigate = useNavigate();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };
  return <a href={href} onClick={handleClick} {...props}>{children}</a>;
}
