"use client";

import { Download, FileText, ImageIcon, Share2 } from 'lucide-react';
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

  return (
    <Dialog open={!!files} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-lg">
        <DialogHeader>
          <DialogTitle>{files?.title ?? 'Report'} is ready</DialogTitle>
          <DialogDescription>
            {pdfShareable
              ? 'Send it to WhatsApp, Mail, Drive and more. Instagram takes the image version.'
              : "This browser can't share files, so download it and attach it from there."}
          </DialogDescription>
        </DialogHeader>
        {files && (
          <div className="grid gap-2">
            {pdfShareable && (
              <Button onClick={() => share(files.pdf)}><Share2 className="mr-2 h-4 w-4" />Share PDF</Button>
            )}
            {imageShareable && (
              <Button variant="secondary" onClick={() => share(files.image!)}><ImageIcon className="mr-2 h-4 w-4" />Share as image</Button>
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
