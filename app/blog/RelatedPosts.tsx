import Image from 'next/image';
import Link from 'next/link';
import type { BlogPost } from '@/lib/types/blog';

interface RelatedPostsProps {
  posts: BlogPost[];
  currentSlug: string;
  currentCategory: string;
}

export function RelatedPosts({
  posts,
  currentSlug,
  currentCategory,
}: RelatedPostsProps) {
  const categoryMatches = posts.filter(
    (post) => post.slug !== currentSlug && post.category === currentCategory
  );
  const fallbackMatches = posts.filter(
    (post) => post.slug !== currentSlug && post.category !== currentCategory
  );
  const relatedPosts = [...categoryMatches, ...fallbackMatches].slice(0, 3);

  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="related-posts-heading" className="mt-12">
      <h2 id="related-posts-heading" className="mb-6 text-2xl font-semibold tracking-tight">
        Related posts
      </h2>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatedPosts.map((post) => {
          const formattedDate = new Date(post.publishedAt).toLocaleDateString(
            'en-US',
            {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
            }
          );

          return (
            <li key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="group block overflow-hidden rounded-xl border bg-card transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Read related post: ${post.title}`}
              >
                <div className="relative h-44 overflow-hidden bg-muted">
                  <Image
                    src={post.featuredImage.url}
                    alt={post.featuredImage.alt}
                    width={post.featuredImage.width}
                    height={post.featuredImage.height}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stellar-blue">
                    {post.category}
                  </p>
                  <h3 className="line-clamp-2 text-lg font-semibold leading-snug group-hover:text-stellar-blue">
                    {post.title}
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={post.publishedAt}>{formattedDate}</time>
                    <span aria-hidden="true" className="mx-1">
                      •
                    </span>
                    {post.author.name}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
