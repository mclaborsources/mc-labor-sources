import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/login');
}

//for testing purposes, we can redirect to the supervisors page instead of login
