"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";

import React from "react";
import { routes } from "next-routes-list";
import { usePathname } from "next/navigation";

export default function NavigationBreadcrumbs() {
  const pathname = usePathname();

  // Find the 3 nearest routes to the current pathname
  // Sort routes by length descending, filter those that are prefixes of the pathname
  const nearestRoutes = routes
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .reverse();

  // Always start with Home
  const breadcrumbs = [
    { href: "/", label: "Home" },
    ...nearestRoutes
      .filter((route) => route !== "/")
      .map((route) => {
        // Convert route to label, e.g. /dashboard/credits -> Dashboard > Credits
        const parts = route.split("/").filter(Boolean);
        const label =
          parts.length > 0
            ? parts[parts.length - 1]
                .replace(/-/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())
            : "Home";
        return { href: route, label };
      }),
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem key={crumb.href}>
                {idx === breadcrumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {idx < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
