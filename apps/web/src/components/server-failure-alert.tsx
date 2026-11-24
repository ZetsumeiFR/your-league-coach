import { Link } from "@tanstack/react-router";
import {
  Button,
  buttonVariants,
} from "@your-league-coach/ui/components/button";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@your-league-coach/ui/components/reui/alert";
import { cn } from "@your-league-coach/ui/lib/utils";

import { useT } from "@/i18n/use-t";
import type { ServerFailure } from "@/utils/orpc";

import { ButtonIcon } from "./button-icon";
import { appIcons } from "./icons";

/** Merged, so the variant's border wins over the transparent one of the base classes. */
export const SETTINGS_LINK = cn(
  buttonVariants({ size: "sm", variant: "outline" })
);

interface ServerFailureAlertProps {
  failure: ServerFailure;
  isRetrying: boolean;
  retry: () => void;
  title: string;
}

export function ServerFailureAlert({
  failure,
  isRetrying,
  retry,
  title,
}: ServerFailureAlertProps) {
  const t = useT();

  return (
    <Alert variant="destructive">
      <appIcons.error />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{t(`server.error.${failure}`)}</p>
      </AlertDescription>
      <AlertAction>
        {failure === "unauthorized" ? (
          <Link className={SETTINGS_LINK} to="/settings">
            {t("server.error.openSettings")}
          </Link>
        ) : (
          <Button
            aria-busy={isRetrying}
            disabled={isRetrying}
            onClick={retry}
            size="sm"
            variant="outline"
          >
            <ButtonIcon
              className={isRetrying ? "animate-spin" : undefined}
              icon={isRetrying ? appIcons.loading : appIcons.refresh}
            />
            {t("server.error.retry")}
          </Button>
        )}
      </AlertAction>
    </Alert>
  );
}
