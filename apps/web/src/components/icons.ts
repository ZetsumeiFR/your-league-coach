import ArrowDownRightIcon from "@your-league-coach/ui/reui/icons/default/outline/arrow-down-right";
import ArrowUpLeftIcon from "@your-league-coach/ui/reui/icons/default/outline/arrow-up-left";
import ArrowsDiagonalIcon from "@your-league-coach/ui/reui/icons/default/outline/arrows-diagonal";
import CloudIcon from "@your-league-coach/ui/reui/icons/default/outline/cloud";
import CrossCircleIcon from "@your-league-coach/ui/reui/icons/default/outline/cross-circle";
import CrownIcon from "@your-league-coach/ui/reui/icons/default/outline/crown";
import DisconnectIcon from "@your-league-coach/ui/reui/icons/default/outline/disconnect";
import EntranceUpIcon from "@your-league-coach/ui/reui/icons/default/outline/entrance-up";
import ExclamationCircleIcon from "@your-league-coach/ui/reui/icons/default/outline/exclamation-circle";
import GameConsoleIcon from "@your-league-coach/ui/reui/icons/default/outline/game-console";
import GearIcon from "@your-league-coach/ui/reui/icons/default/outline/gear";
import GlobeIcon from "@your-league-coach/ui/reui/icons/default/outline/globe";
import HashIcon from "@your-league-coach/ui/reui/icons/default/outline/hash";
import HomeIcon from "@your-league-coach/ui/reui/icons/default/outline/home";
import KeyIcon from "@your-league-coach/ui/reui/icons/default/outline/key";
import LinkIcon from "@your-league-coach/ui/reui/icons/default/outline/link";
import LoadingIcon from "@your-league-coach/ui/reui/icons/default/outline/loading";
import MoonIcon from "@your-league-coach/ui/reui/icons/default/outline/moon";
import PinIcon from "@your-league-coach/ui/reui/icons/default/outline/pin";
import RefreshArrowClockwiseIcon from "@your-league-coach/ui/reui/icons/default/outline/refresh-arrow-clockwise";
import ShieldIcon from "@your-league-coach/ui/reui/icons/default/outline/shield";
import SunIcon from "@your-league-coach/ui/reui/icons/default/outline/sun";
import TargetIcon from "@your-league-coach/ui/reui/icons/default/outline/target";
import TreeIcon from "@your-league-coach/ui/reui/icons/default/outline/tree";
import WrenchIcon from "@your-league-coach/ui/reui/icons/default/outline/wrench";
import type { ComponentType } from "react";

type AppIcon = ComponentType<{ className?: string }>;

/**
 * Every icon the app uses, in the ReUI outline style. Screens take icons from
 * this map only. To add one, run from the repo root
 * `bunx shadcn@latest add -c packages/ui @reui/icons/default/outline/<name>`
 * and add a key here.
 */
export const appIcons = {
  // The app's own mark in the sidebar; kept apart from every screen icon.
  brand: CrownIcon,
  home: HomeIcon,
  draft: TargetIcon,
  build: WrenchIcon,
  inGame: GameConsoleIcon,
  settings: GearIcon,
  connected: LinkIcon,
  disconnected: DisconnectIcon,
  warning: ExclamationCircleIcon,
  error: CrossCircleIcon,
  refresh: RefreshArrowClockwiseIcon,
  import: EntranceUpIcon,
  pin: PinIcon,
  language: GlobeIcon,
  key: KeyIcon,
  server: CloudIcon,
  patch: HashIcon,
  // Neither ReUI nor Data Dragon ships role icons: lanes follow their
  // direction on the map, jungle is a tree, support a shield.
  roleTop: ArrowUpLeftIcon,
  roleJungle: TreeIcon,
  roleMid: ArrowsDiagonalIcon,
  roleBottom: ArrowDownRightIcon,
  roleSupport: ShieldIcon,
  themeLight: SunIcon,
  themeDark: MoonIcon,
  loading: LoadingIcon,
} as const satisfies Record<string, AppIcon>;
