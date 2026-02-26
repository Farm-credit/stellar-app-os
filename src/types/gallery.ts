export interface GalleryImage {
  id: string;
  url: string;   // We will use 'url' everywhere
  alt: string;
  width: number;
  height: number;
  caption?: string;
}