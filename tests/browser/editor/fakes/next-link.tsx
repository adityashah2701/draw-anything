import type { AnchorHTMLAttributes } from "react";

export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
