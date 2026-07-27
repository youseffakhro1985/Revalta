import { ImageResponse } from "next/og";

export const alt = "Revalta – fastighetssystem för svensk förvaltning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#fafaf8",
          color: "#14231f",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          padding: "58px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid #deded5",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "54px 58px",
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "18px" }}>
            <span style={{ color: "#214e46", fontSize: "34px", fontWeight: 700 }}>Revalta</span>
            <span style={{ background: "#cbcbbf", height: "32px", width: "1px" }} />
            <span
              style={{
                color: "#6f756f",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Svenskt fastighetssystem
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", maxWidth: "900px" }}>
            <span
              style={{
                color: "#2d655b",
                fontSize: "17px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                marginBottom: "22px",
                textTransform: "uppercase",
              }}
            >
              För svensk fastighetsförvaltning
            </span>
            <span style={{ fontSize: "65px", fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1.05 }}>
              Ett lugnare sätt att förvalta fastigheter.
            </span>
          </div>

          <div style={{ alignItems: "center", color: "#59645f", display: "flex", fontSize: "20px", gap: "30px" }}>
            <span>Fastighetsägare</span>
            <span style={{ background: "#4d8178", borderRadius: "50%", height: "7px", width: "7px" }} />
            <span>BRF</span>
            <span style={{ background: "#4d8178", borderRadius: "50%", height: "7px", width: "7px" }} />
            <span>Förvaltare</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
