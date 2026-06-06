const TAG_PASTELS = [
  { background: "#FCE7F3", border: "#F9A8D4", text: "#9D174D" },
  { background: "#E0F2FE", border: "#7DD3FC", text: "#075985" },
  { background: "#DCFCE7", border: "#86EFAC", text: "#166534" },
  { background: "#FEF3C7", border: "#FCD34D", text: "#92400E" },
  { background: "#EDE9FE", border: "#C4B5FD", text: "#5B21B6" },
  { background: "#CCFBF1", border: "#5EEAD4", text: "#115E59" },
  { background: "#FFE4E6", border: "#FDA4AF", text: "#9F1239" },
  { background: "#F3E8FF", border: "#D8B4FE", text: "#6B21A8" },
  { background: "#DBEAFE", border: "#93C5FD", text: "#1E40AF" },
  { background: "#ECFCCB", border: "#BEF264", text: "#3F6212" },
  { background: "#FED7AA", border: "#FDBA74", text: "#9A3412" },
  { background: "#E0E7FF", border: "#A5B4FC", text: "#3730A3" },
];

function hashString(value: string) {
  return Array.from(value).reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) >>> 0;
  }, 0);
}

export function getTagPastelStyle(tag: string) {
  const normalizedTag = tag.trim().toLowerCase();
  const palette = TAG_PASTELS[hashString(normalizedTag) % TAG_PASTELS.length];

  return {
    backgroundColor: palette.background,
    borderColor: palette.border,
    color: palette.text,
  };
}
