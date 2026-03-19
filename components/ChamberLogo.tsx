import Image from "next/image";

/**
 * The Chamber logo — renders the /public/logo.svg at the given size.
 * Falls back to the inline SVG if needed.
 */
export default function ChamberLogo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt="The Chamber"
      width={size}
      height={size}
      priority
    />
  );
}
