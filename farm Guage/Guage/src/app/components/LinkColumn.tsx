interface Link {
  label: string;
  href: string;
}

interface LinkColumnProps {
  title: string;
  links: Link[];
}

export function LinkColumn({ title, links }: LinkColumnProps) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none focus:text-white focus:underline"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
