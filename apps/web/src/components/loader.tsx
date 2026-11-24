import { appIcons } from "./icons";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <appIcons.loading className="animate-spin" />
    </div>
  );
}
