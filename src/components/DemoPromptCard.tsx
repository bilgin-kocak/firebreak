import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface DemoPromptCardProps {
  number: 1 | 2;
  title: string;
  prompt: string;
  onCopied(message: string): void;
}

export const DemoPromptCard = ({ number, title, prompt, onCopied }: DemoPromptCardProps) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    onCopied(`Prompt ${number} copied.`);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <article className="prompt-card">
      <div className="prompt-card-header">
        <span className="eyebrow">Prompt {number}</span>
        <span className="prompt-title">{title}</span>
      </div>
      <p>{prompt}</p>
      <button
        className="copy-button"
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy prompt ${number}`}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Copied" : "Copy prompt"}
      </button>
    </article>
  );
};
