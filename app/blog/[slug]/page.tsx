import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fetchAllBlogPosts,
  fetchBlogPostBySlug,
} from '@/lib/api/blog';
import { CommentSection } from '@/app/blog/CommentSection';
import { MarkdownRenderer } from '@/app/blog/MarkdownRenderer';
import { RelatedPosts } from '@/app/blog/RelatedPosts';
import { ShareButtons } from '@/app/blog/ShareButtons';
import {
  generateBlogPostMetadata,
  generateBlogPostingSchema,
  generateCanonicalUrl,
} from '@/lib/utils/seo';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await fetchAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) {
    return {
      title: 'Post not found | FarmCredit',
      description: 'The requested blog post could not be found.',
    };
  }

  return generateBlogPostMetadata(post);
}

function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const allPosts = await fetchAllBlogPosts();
  const formattedDate = new Date(post.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });

  const canonicalUrl = generateCanonicalUrl(`/blog/${post.slug}`);
  const schema = generateBlogPostingSchema(post);
  const commentsEnabled = process.env.NEXT_PUBLIC_ENABLE_BLOG_COMMENTS === 'true';

  return (
    <main id="main-content" className="mx-auto w-full max-w-[960px] px-4 py-10 sm:px-6 lg:px-8">
      <article aria-labelledby="post-title">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center text-sm font-medium text-stellar-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Back to blog
        </Link>

        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-stellar-blue">
            {post.category}
          </p>
          <h1 id="post-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="text-lg text-muted-foreground">{post.excerpt}</p>

          <div className="flex flex-wrap items-center gap-4 border-y py-4">
            <div className="flex items-center gap-3">
              {post.author.avatar ? (
                <Image
                  src={post.author.avatar}
                  alt={`${post.author.name} avatar`}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground"
                  aria-hidden="true"
                >
                  {getAuthorInitials(post.author.name)}
                </div>
              )}

              <div>
                <p className="font-medium">{post.author.name}</p>
                <p className="text-sm text-muted-foreground">
                  Published <time dateTime={post.publishedAt}>{formattedDate}</time>
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="my-8 overflow-hidden rounded-2xl border">
          <Image
            src={post.featuredImage.url}
            alt={post.featuredImage.alt}
            width={post.featuredImage.width}
            height={post.featuredImage.height}
            className="h-auto w-full object-cover"
            priority
          />
        </div>

        <div className="mb-8">
          <ShareButtons title={post.title} url={canonicalUrl} />
        </div>

        <section aria-label="Post body">
          <MarkdownRenderer content={post.content} />
        </section>

        <div className="mt-8">
          <ShareButtons title={post.title} url={canonicalUrl} />
        </div>

        <RelatedPosts
          posts={allPosts}
          currentSlug={post.slug}
          currentCategory={post.category}
        />
        <CommentSection enabled={commentsEnabled} />
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </main>
  );
}
