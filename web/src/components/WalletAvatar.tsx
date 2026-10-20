// Small round avatar for an on-chain participant: their organisation logo if they linked a wallet,
// otherwise a colour derived from the address so the same wallet always looks the same.
export function WalletAvatar({
  wallet,
  name,
  avatarUrl,
  size = 24,
  className = "",
}: {
  wallet: string;
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`shrink-0 rounded-full bg-white object-cover ${className}`} style={style} />;
  }
  const hue = parseInt(wallet.slice(2, 8) || "0", 16) % 360;
  const label = name
    ? name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
    : wallet.slice(2, 4).toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${className}`}
      style={{ ...style, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 55% 32%))` }}
    >
      {label}
    </span>
  );
}
