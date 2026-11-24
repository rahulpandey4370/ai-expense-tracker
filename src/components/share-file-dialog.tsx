"use client";

import { useEffect, useState } from 'react';
import { Download, Eye, ExternalLink, FileText, ImageIcon, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadFile } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';

export interface ShareFiles { title: string; pdf: File; image?: File }

const canShare = (f: File) => typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [f] });

/**
 * The report is ready: share it through the phone's own share sheet (WhatsApp, Mail,
 * Drive, Instagram for the image, …) or download it. Sharing has to start from a tap,
 * which is why this opens after the file is made instead of sharing straight away.
 */
export function ShareFileDialog({ files, onClose }: { files: ShareFiles | null; onClose: () => void }) {
  const { toast } = useToast();
  const [viewing, setViewing] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!files) { setViewing(false); return; }
    const u = URL.createObjectURL(files.pdf);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [files]);
  // Laptops can't hand a file to WhatsApp: download it and open WhatsApp with a note to attach it.
  const whatsappFallback = () => {
    if (!files) return;
    downloadFile(files.pdf.name, files.pdf);
    window.open(`https://wa.me/?text=${encodeURIComponent(`${files.title} (PDF attached)`)}`, '_blank', 'noopener');
  };
  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: files?.title });
      onClose();
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // closed the share sheet
      toast({ title: "Couldn't share", description: 'The file was downloaded instead.', variant: 'destructive' });
      downloadFile(file.name, file);
    }
  };
  const pdfShareable = !!files && canShare(files.pdf);
  const imageShareable = !!files?.image && canShare(files.image);

  if (viewing && files && url) {
    return (
      <Dialog open onOpenChange={open => { if (!open) setViewing(false); }}>
        <DialogContent className="flex h-[88svh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-2 rounded-lg p-3">
          <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
            <DialogTitle className="truncate text-base">{files.title}</DialogTitle>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
          </DialogHeader>
          <DialogDescription className="sr-only">PDF preview</DialogDescription>
          <iframe src={url} title={files.title} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setViewing(false)}>Back</Button>
            <Button onClick={() => (pdfShareable ? share(files.pdf) : downloadFile(files.pdf.name, files.pdf))}>
              {pdfShareable ? <><Share2 className="mr-2 h-4 w-4" />Share</> : <><Download className="mr-2 h-4 w-4" />Download</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={!!files} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-lg">
        <DialogHeader>
          <DialogTitle>{files?.title ?? 'Report'} is ready</DialogTitle>
          <DialogDescription>
            {pdfShareable
              ? `View it here, or send it to WhatsApp, Mail, Drive and more.${files?.image ? ' Instagram takes the image version.' : ''}`
              : 'View it here, download it, or send it on WhatsApp (it downloads, then attach it in the chat).'}
          </DialogDescription>
        </DialogHeader>
        {files && (
          <div className="grid gap-2">
            <Button variant="secondary" onClick={() => setViewing(true)}><Eye className="mr-2 h-4 w-4" />View PDF</Button>
            {pdfShareable && (
              <Button onClick={() => share(files.pdf)}><Share2 className="mr-2 h-4 w-4" />Share PDF</Button>
            )}
            {imageShareable && (
              <Button variant="secondary" onClick={() => share(files.image!)}><ImageIcon className="mr-2 h-4 w-4" />Share as image</Button>
            )}
            {!pdfShareable && (
              <Button onClick={whatsappFallback}><MessageCircle className="mr-2 h-4 w-4" />Send on WhatsApp</Button>
            )}
            <Button variant="outline" onClick={() => { downloadFile(files.pdf.name, files.pdf); onClose(); }}>
              <Download className="mr-2 h-4 w-4" />Download PDF
            </Button>
            {files.image && !imageShareable && (
              <Button variant="ghost" onClick={() => { downloadFile(files.image!.name, files.image!); onClose(); }}>
                <FileText className="mr-2 h-4 w-4" />Download as image
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
