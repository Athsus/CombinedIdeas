export type ParsedKnowledgeFile = {
  id: string;
  name: string;
  extension: "txt" | "md" | "docx";
  text: string;
  chars: number;
};

const SUPPORTED_EXTENSIONS = ["txt", "md", "docx"] as const;

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

async function parseDocx(file: File): Promise<string> {
  const moduleUrl = "https://esm.sh/mammoth/mammoth.browser?bundle";
  const module = await import(/* @vite-ignore */ moduleUrl);

  const mammoth = (module as { default?: { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).default;

  if (!mammoth?.extractRawText) {
    throw new Error("DOCX parser failed to load.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

export function getAcceptedFileTypes(): string {
  return ".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function parseKnowledgeFile(file: File): Promise<ParsedKnowledgeFile> {
  const extension = getExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(`Unsupported file type for ${file.name}. Use txt, md, or docx.`);
  }

  const text = extension === "docx" ? await parseDocx(file) : await file.text();
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    throw new Error(`${file.name} is empty after parsing.`);
  }

  return {
    id: `${file.name}-${file.lastModified}`,
    name: file.name,
    extension: extension as ParsedKnowledgeFile["extension"],
    text: normalized,
    chars: normalized.length,
  };
}
