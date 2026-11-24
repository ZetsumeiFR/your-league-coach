import type { ComponentType } from "react";

interface ButtonIconProps {
  className?: string;
  icon: ComponentType<{ className?: string }>;
  position?: "inline-start" | "inline-end";
}

/**
 * An icon inside a Button. Buttons trim their padding next to an element that
 * carries `data-icon`, and ReUI icons accept nothing but `className`, so the
 * attribute sits on a wrapper that takes no part in the layout.
 */
export function ButtonIcon({
  className,
  icon: Icon,
  position = "inline-start",
}: ButtonIconProps) {
  return (
    <span className="contents" data-icon={position}>
      <Icon className={className} />
    </span>
  );
}
