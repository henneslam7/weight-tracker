import { WHO_AVATAR, WHO_NAME, type Line } from "@/lib/copy";
import type { Who } from "@/lib/types";

export function Avatar({ who, size = 52 }: { who: Who; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={WHO_AVATAR[who]}
      alt={WHO_NAME[who]}
      width={size}
      height={size}
      className="shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-black/5"
      style={{ width: size, height: size }}
    />
  );
}

/** 陳伯企右邊、歡嬸企左邊，好似兩個街坊輪流講嘢 */
export function Say({
  line,
  children,
  tone = "default",
}: {
  line: Line;
  children?: React.ReactNode;
  tone?: "default" | "gossip";
}) {
  const right = line.who === "chan";
  const bubble =
    tone === "gossip"
      ? "bg-amber-50 ring-2 ring-dashed ring-amber-200"
      : right
        ? "bg-rose-50 ring-1 ring-rose-100"
        : "bg-white ring-1 ring-teal-100";
  return (
    <div className={`flex items-start gap-3 ${right ? "flex-row-reverse" : ""}`}>
      <Avatar who={line.who} />
      <div className={`min-w-0 flex-1 rounded-2xl p-3 leading-relaxed ${bubble} ${right ? "rounded-tr-md" : "rounded-tl-md"}`}>
        <span className={`mb-0.5 block text-xs font-bold ${right ? "text-rose-600" : "text-teal-700"}`}>
          {WHO_NAME[line.who]}
        </span>
        {line.text}
        {children}
      </div>
    </div>
  );
}
