import type { Metadata, Viewport } from 'next';
import './globals.css';


export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export const metadata: Metadata = {
	title: 'Axie Conquest | Everleaf Haven',
	description: 'Build a new home in Lunacia.',
};

export default function RootLayout({
	children,
}: {
    children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
