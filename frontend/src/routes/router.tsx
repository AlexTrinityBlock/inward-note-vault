import { createBrowserRouter } from "react-router-dom";

import { Layout } from "../components/Layout";
import { HomeRoute } from "./HomeRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [{ index: true, element: <HomeRoute /> }],
  },
]);
