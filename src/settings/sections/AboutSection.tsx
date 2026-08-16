import { ExternalLink, LockKeyhole, MonitorCheck, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function getExtensionVersion(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // Preview/test environments lack the extension runtime.
  }
  return "—";
}

interface InfoRowProps {
  icon: LucideIcon;
  children: React.ReactNode;
}

function InfoRow({ icon: Icon, children }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 break-words pt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export function AboutSection() {
  return (
    <section aria-labelledby="about-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle id="about-section-title" className="text-base">Giới thiệu</CardTitle>
          <CardDescription>ExtentionTranslate phiên bản {getExtensionVersion()}.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 divide-y">
          <InfoRow icon={ExternalLink}>
            Dữ liệu từ điển tiếng Anh sử dụng{" "}
            <a className="font-medium text-foreground underline hover:text-foreground/80" href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer">dictionaryapi.dev</a>{" "}
            và{" "}
            <a className="font-medium text-foreground underline hover:text-foreground/80" href="https://freedictionaryapi.com/api/v1" target="_blank" rel="noreferrer">FreeDictionaryAPI.com</a>{" "}
            (CC BY-SA 4.0) làm nguồn dự phòng.
          </InfoRow>
          <InfoRow icon={LockKeyhole}>
            OpenRouter API key của bạn chỉ được lưu cục bộ trong trình duyệt và dùng để gọi OpenRouter.
          </InfoRow>
          <InfoRow icon={MonitorCheck}>
            Tiện ích hỗ trợ Google Chrome và Microsoft Edge.
          </InfoRow>
        </CardContent>
      </Card>

      <a href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-words text-sm font-medium underline hover:text-foreground/80">
        Xem tài liệu dictionaryapi.dev
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </section>
  );
}
