"use client";

import { useState } from "react";
import { Share2, QrCode, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The public, shareable tournament URL (CLAUDE.md §1). */
export const SHARE_URL = "https://lfg-olympics.vercel.app";

/**
 * Copy `text` to the clipboard. Tries the async Clipboard API first (requires a
 * secure context), then falls back to a hidden textarea + execCommand for older
 * / non-secure browsers. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Share" + QR control for the leaderboard (CLAUDE.md §6 polish):
 *  - Tapping Share opens the native share sheet on devices that support
 *    `navigator.share`; otherwise it copies the URL to the clipboard.
 *  - A small QR button opens a modal with a scannable QR code of the URL plus a
 *    copy-link button (works everywhere, including desktop).
 */
export function ShareButton({ url = SHARE_URL }: { url?: string }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function doCopy() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  async function handleShare() {
    // Native share sheet where available (most mobile browsers).
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "LFG Olympics",
          text: "Live leaderboard for the LFG Olympics",
          url,
        });
        return;
      } catch (err) {
        // AbortError = user dismissed the sheet; don't fall back / toast.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure: fall through to clipboard.
      }
    }
    await doCopy();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleShare}
        aria-label="Share leaderboard"
      >
        <Share2 className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setQrOpen(true)}
        aria-label="Show QR code"
      >
        <QrCode className="size-5" />
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Scan to join</DialogTitle>
            <DialogDescription>
              Point a phone camera here to open the live leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl bg-white p-4 ring-1 ring-foreground/10">
              <QRCodeSVG value={url} size={200} marginSize={0} />
            </div>
            <p className="break-all text-center text-xs text-muted-foreground">
              {url.replace(/^https?:\/\//, "")}
            </p>
            <Button variant="outline" className="w-full" onClick={doCopy}>
              {copied ? (
                <>
                  <Check className="size-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copy link
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
