# Staging Breadcrumb Schema Fix Report

Date: 2026-07-04

## Existing Behavior

PDPs emit BreadcrumbList JSON-LD.
Sell Your Saree and keyword pages also have schema support where applicable.

## This Pass

When QA/test products are noindexed and Product JSON-LD is suppressed, PDP BreadcrumbList JSON-LD is still retained.

## Reason

Breadcrumbs describe navigation, not product quality claims, and can remain truthful on noindexed utility pages.

