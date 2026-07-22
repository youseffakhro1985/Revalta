import { ImageResponse } from "next/og";

export const alt = "Revalta – svensk fastighetsförvaltning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f7f4ed",
        color: "#17211f",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #ded9ce",
          borderRadius: "28px",
          boxShadow: "0 24px 70px rgba(23, 33, 31, 0.08)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "62px 68px",
          width: "100%",
        }}
      >
        <div style={{ color: "#214e46", display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "-1px" }}>Revalta</div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "900px" }}>
          <div style={{ color: "#214e46", display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase" }}>
            Svensk fastighetsförvaltning
          </div>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 650, letterSpacing: "-2.5px", lineHeight: 1.08, marginTop: "22px" }}>
            Ett lugnare sätt att förvalta fastigheter.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
