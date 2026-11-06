import { Route, Routes } from "react-router-dom";
import Editor from "./pages/Editor";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Projects />} />
    <Route path="/p/:projectId" element={<Editor />} />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default AppRoutes;
