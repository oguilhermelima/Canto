import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 128, height: 128 };
export const contentType = "image/png";

export default async function Icon() {
  const imgData = await readFile(join(process.cwd(), "public", "room.png"));
  const base64 = imgData.toString("base64");
  const src = `data:image/png;base64,${base64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#dc2626",
          borderRadius: "28px",
        }}
      >
        <img
          src={src}
          width={84}
          height={84}
          style={{ filter: "invert(1)" }}
        />
      </div>
    ),
    { ...size },
  );
}
