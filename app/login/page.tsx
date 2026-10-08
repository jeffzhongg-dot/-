import { configured } from '../../lib/security';
import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export default function LoginPage() { return <LoginForm configured={configured()} locked={process.env.DEPLOYMENT_LOCKED !== 'false'}/>; }
