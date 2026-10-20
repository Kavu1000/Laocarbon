import type { User } from "@/lib/auth";

export function Avatar({ user, size = 32 }: { user: Pick<User, "orgName" | "avatarUrl">; size?: number }) {
  const initials = user.orgName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-brand font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}
