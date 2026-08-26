import { LoggedOutHome } from "../logged-out-home";
import { HomeScreenSections } from "./home-screen-sections";
import { useHomeScreenController } from "./use-home-screen-controller";

export function HomeScreen() {
  const controller = useHomeScreenController();

  if (controller.showLoggedOutHome) return <LoggedOutHome />;

  return <HomeScreenSections controller={controller} />;
}
