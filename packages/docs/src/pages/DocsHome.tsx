import { ArrowRight, BookOpen, Cog, FileText, Shield, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const sections = [
  {
    title: 'Getting Started',
    description: 'Learn what SENTINEL is and take a quick tour of the main features.',
    icon: BookOpen,
    href: '/docs/getting-started/welcome',
    color: 'text-blue-500',
  },
  {
    title: 'For Users',
    description: 'Manage your credentials, view tools, and approve sensitive actions.',
    icon: User,
    href: '/docs/users/dashboard',
    color: 'text-green-500',
  },
  {
    title: 'For Administrators',
    description: 'Manage users, create access rules, and monitor your organization.',
    icon: Shield,
    href: '/docs/admin/dashboard',
    color: 'text-purple-500',
  },
  {
    title: 'Technical Setup',
    description: 'Deploy SENTINEL and configure your IDE or AI coding assistant.',
    icon: Cog,
    href: '/docs/setup/deployment',
    color: 'text-orange-500',
  },
  {
    title: 'Reference',
    description: 'Technical policy syntax and troubleshooting guides.',
    icon: FileText,
    href: '/docs/reference/policy-syntax',
    color: 'text-red-500',
  },
];

export function DocsHome() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-display font-bold mb-4">SENTINEL Documentation</h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          Control what AI tools can do in your organization. Manage access, require approvals for
          sensitive actions, and track everything in one place.
        </p>
      </div>

      {/* Quick start card */}
      <div className="mb-12 p-6 rounded-xl border border-brand-500/30 bg-brand-500/5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-brand-500/10">
            <BookOpen className="h-6 w-6 text-brand-600 dark:text-brand-300" />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-semibold text-lg mb-2">New to SENTINEL?</h2>
            <p className="text-muted-foreground mb-4">
              Start with our welcome guide to understand what SENTINEL does and how it can help your
              team.
            </p>
            <Link
              to="/docs/getting-started/welcome"
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-brand-600 dark:bg-brand-500 text-white font-medium text-sm',
                'hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors',
              )}
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Section cards */}
      <h2 className="font-display font-semibold text-xl mb-6">Explore the docs</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            to={section.href}
            className={cn(
              'group p-5 rounded-xl border border-border',
              'hover:border-brand-500/50 hover:bg-accent/50 transition-all',
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn('p-2 rounded-lg bg-muted', section.color)}>
                <section.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1 group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                  {section.title}
                </h3>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-brand-600 dark:group-hover:text-brand-300 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        ))}
      </div>

      {/* Resources */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="font-display font-semibold text-xl mb-6">Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://github.com/sentinel/sentinel"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <h3 className="font-medium mb-1">GitHub</h3>
            <p className="text-sm text-muted-foreground">View source and contribute</p>
          </a>
          <a
            href="https://discord.gg/sentinel"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <h3 className="font-medium mb-1">Discord</h3>
            <p className="text-sm text-muted-foreground">Join the community</p>
          </a>
        </div>
      </div>
    </div>
  );
}
