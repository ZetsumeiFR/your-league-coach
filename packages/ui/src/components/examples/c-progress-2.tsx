import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@your-league-coach/ui/components/progress";

export function Pattern() {
  return (
    <div className="mx-auto w-full max-w-xs">
      <Progress className="**:data-[slot=progress-track]:h-1" value={30}>
        <ProgressLabel>Small progress</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  );
}
