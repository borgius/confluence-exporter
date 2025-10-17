/**
 * Utility functions used across the application
 */

/**
 * Convert text to safe filename/slug
 * 
 * @param text - Text to slugify
 * @returns Slugified text (lowercase, hyphens, no special chars)
 * 
 * @example
 * slugify("My Page Title!") // "my-page-title"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .trim();
}

/**
 * Attempt to reverse slugification (best effort)
 * Converts hyphens to spaces and capitalizes first letter of each word
 * 
 * @param slug - Slugified text to convert back
 * @returns Title-cased text with spaces
 * 
 * @example
 * unslugify("my-page-title") // "My Page Title"
 */
export function unslugify(slug: string): string {
  return slug
    .replace(/-/g, ' ')           // Replace hyphens with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize first letter of each word
}
