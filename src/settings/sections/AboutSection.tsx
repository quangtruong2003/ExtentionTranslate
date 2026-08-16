import { ExternalLink, LockKeyhole, MonitorCheck } from "lucide-react";
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

export function AboutSection() {
  return (
    <section aria-labelledby="about-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle id="about-section-title">Giới thiệu</CardTitle>
          <CardDescription>{`ExtentionTranslate phiên bản ${getExtensionVersion()}.`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 break-words text-sm text-muted-foreground">
          <p>
            Dữ liệu từ điển tiếng Anh sử dụng <a className="text-primary underline hover:text-primary/80" href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer">dictionaryapi.dev</a> và{" "}
            <a className="text-primary underline hover:text-primary/80" href="https://freedictionaryapi.com/api/v1" target="_blank" rel="noreferrer">FreeDictionaryAPI.com</a> (CC BY-SA 4.0) làm nguồn dự phòng.
          </p>
          <p className="flex gap-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            OpenRouter API key của bạn chỉ được lưu cục bộ trong trình duyệt và dùng để gọi OpenRouter.
          </p>
          <p className="flex gap-2">
            <MonitorCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Tiện ích hỗ trợ Google Chrome và Microsoft Edge.
          </p>
        </CardContent>
      </Card>

      <a href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-words text-sm font-medium text-primary hover:underline">
        Xem tài liệu dictionaryapi.dev
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </section>
  );
}
