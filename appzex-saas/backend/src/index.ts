
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, Status } from '@prisma/client';
import OpenAI from 'openai';

const app = express();

// Prisma Client
const db: any = new PrismaClient();
const secret = process.env.JWT_SECRET || 'dev-only-change-me';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));
app.use(express.json());

type AuthReq = Request & {
  user?: {
    id: number;
    role: Role;
    agencyId: number | null;
    clientId: number | null;
    name: string;
  };
};

// Authentication middleware
const auth = (
  req: AuthReq,
  res: Response,
  next: NextFunction
) => {
  try {
    const h = req.headers.authorization;

    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Login required'
      });
    }

    req.user = jwt.verify(
      h.slice(7),
      secret
    ) as AuthReq['user'];

    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }
};

// Role-based access middleware
const roles = (...allowedRoles: Role[]) =>
  (req: AuthReq, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    next();
  };

// Agency access middleware
const agency = (
  req: AuthReq,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role === 'SUPER_ADMIN') {
    return next();
  }

  if (!req.user?.agencyId) {
    return res.status(403).json({
      error: 'Agency access required'
    });
  }

  db.agency
    .findUnique({
      where: { id: req.user.agencyId }
    })
    .then((a: any) => {
      if (!a || a.status !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Agency is suspended or inactive'
        });
      }

      next();
    })
    .catch(next);
};

const tenant = (u: NonNullable<AuthReq['user']>) => u.agencyId!;

const requireClientId = (req: AuthReq, res: Response) => {
  if (req.user?.role === 'CLIENT' && req.user.clientId == null) {
    res.status(403).json({
      error: 'Client access is not configured'
    });

    return false;
  }

  return true;
};

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'AgencyFlow API'
  });
});

// Authentication
app.post(
  '/api/auth/login',
  async (req: Request, res: Response) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const u = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        agency: true,
        client: true
      }
    });

    if (!u || !await bcrypt.compare(password || '', u.password)) {
      return res.status(401).json({
        error: 'Email or password is incorrect'
      });
    }

    if (u.agency && u.agency.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This agency account is inactive or suspended'
      });
    }

    const payload = {
      id: u.id,
      name: u.name,
      role: u.role,
      agencyId: u.agencyId,
      clientId: u.clientId
    };

    res.json({
      token: jwt.sign(payload, secret, {
        expiresIn: '12h'
      }),
      user: payload
    });
  }
);

app.get(
  '/api/me',
  auth,
  (req: AuthReq, res: Response) => {
    res.json(req.user);
  }
);

// Super Admin overview
app.get(
  '/api/admin/overview',
  auth,
  roles(Role.SUPER_ADMIN),
  async (_req, res) => {
    const [
      agencies,
      users,
      clients,
      projects,
      active
    ] = await Promise.all([
      db.agency.count(),
      db.user.count(),
      db.client.count(),
      db.project.count(),
      db.agency.count({
        where: { status: 'ACTIVE' }
      })
    ]);

    res.json({
      agencies,
      active,
      inactive: agencies - active,
      users,
      clients,
      projects
    });
  }
);

// Create Agency with Agency Admin
app.post(
  '/api/admin/agencies',
  auth,
  roles(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        adminName,
        adminEmail,
        adminPassword
      } = req.body || {};

      if (
        !name?.trim() ||
        !email?.trim() ||
        !adminName?.trim() ||
        !adminEmail?.trim() ||
        !adminPassword
      ) {
        return res.status(400).json({
          error: 'All fields are required'
        });
      }

      if (
        typeof adminPassword !== 'string' ||
        adminPassword.length < 8
      ) {
        return res.status(400).json({
          error: 'Admin password must be at least 8 characters'
        });
      }

      const normalizedAdminEmail =
        adminEmail.trim().toLowerCase();

      const normalizedAgencyEmail =
        email.trim().toLowerCase();

      const existing = await db.user.findUnique({
        where: {
          email: normalizedAdminEmail
        }
      });

      if (existing) {
        return res.status(409).json({
          error: 'An account with this admin email already exists'
        });
      }

      const hashedPassword = await bcrypt.hash(
        adminPassword,
        12
      );

      const created = await db.$transaction(
        async (tx: any) => {
          return tx.agency.create({
            data: {
              name: name.trim(),
              email: normalizedAgencyEmail,
              status: 'ACTIVE',
              users: {
                create: {
                  name: adminName.trim(),
                  email: normalizedAdminEmail,
                  password: hashedPassword,
                  role: 'AGENCY_ADMIN'
                }
              }
            },
            include: {
              _count: {
                select: {
                  users: true,
                  clients: true,
                  projects: true
                }
              }
            }
          });
        }
      );

      return res.status(201).json(created);
    } catch (error: any) {
      console.error('Create agency error:', error);

      return res.status(500).json({
        error: 'Failed to create agency'
      });
    }
  }
);

// Get all agencies
app.get(
  '/api/admin/agencies',
  auth,
  roles(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const q = String(req.query.q || '');

    const rows = await db.agency.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } }
            ]
          }
        : {},
      include: {
        _count: {
          select: {
            users: true,
            clients: true,
            projects: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(rows);
  }
);

// Update agency status
app.patch(
  '/api/admin/agencies/:id/status',
  auth,
  roles(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const status = req.body.status as Status;

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status'
      });
    }

    const a = await db.agency.update({
      where: {
        id: Number(req.params.id)
      },
      data: { status }
    });

    res.json(a);
  }
);

// Get agency details
app.get(
  '/api/admin/agencies/:id',
  auth,
  roles(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const a = await db.agency.findUnique({
      where: {
        id: Number(req.params.id)
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        clients: true,
        projects: true
      }
    });

    if (!a) {
      return res.status(404).json({
        error: 'Agency not found'
      });
    }

    res.json(a);
  }
);

// Tenant-scoped dashboard
app.get(
  '/api/dashboard',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM, Role.CLIENT),
  async (req: AuthReq, res: Response) => {
    const user = req.user!;
    const aid = tenant(user);

    if (!requireClientId(req, res)) return;

    const clientScope =
      user.role === 'CLIENT'
        ? { clientId: user.clientId! }
        : {};

    const [
      clients,
      projects,
      tasks,
      feedback,
      activities
    ] = await Promise.all([
      user.role === 'CLIENT'
        ? Promise.resolve(0)
        : db.client.count({
            where: { agencyId: aid }
          }),

      db.project.findMany({
        where: {
          agencyId: aid,
          ...clientScope
        },
        include: {
          tasks: true,
          client: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }),

      db.task.count({
        where: {
          project: {
            agencyId: aid,
            ...clientScope
          },
          status: { not: 'DONE' }
        }
      }),

      db.feedback.count({
        where: {
          project: {
            agencyId: aid,
            ...clientScope
          },
          status: {
            in: ['OPEN', 'IN_REVIEW']
          }
        }
      }),

      db.activity.findMany({
        where: {
          agencyId: aid,
          ...(user.role === 'CLIENT'
            ? { visibility: 'CLIENT' }
            : {})
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 8
      })
    ]);

    const shaped = projects.map((p: any) => ({
      ...p,
      progress: p.tasks.length
        ? Math.round(
            p.tasks.filter(
              (t: any) => t.status === 'DONE'
            ).length /
              p.tasks.length *
              100
          )
        : 0
    }));

    res.json({
      clients,
      projects: shaped,
      tasks,
      feedback,
      activities
    });
  }
);

// Clients
app.get(
  '/api/clients',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const rows = await db.client.findMany({
      where: {
        agencyId: tenant(req.user!)
      },
      include: {
        _count: {
          select: {
            projects: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(rows);
  }
);

app.post(
  '/api/clients',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN),
  async (req: AuthReq, res: Response) => {
    const { company, contactName, email, phone, notes, portalPassword } = req.body || {};

    if (
      typeof company !== 'string' || !company.trim() ||
      typeof contactName !== 'string' || !contactName.trim() ||
      typeof email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()) ||
      typeof portalPassword !== 'string' || portalPassword.length < 8
    ) {
      return res.status(400).json({
        error: 'Enter a company, contact name, valid email and portal password of at least 8 characters'
      });
    }

    const aid = tenant(req.user!);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    try {
      const hashedPassword = await bcrypt.hash(portalPassword, 12);
      const created = await db.$transaction(async (tx: any) => {
        const client = await tx.client.create({
          data: {
            company: company.trim(),
            contactName: contactName.trim(),
            email: normalizedEmail,
            phone: typeof phone === 'string' ? phone.trim() || null : null,
            notes: typeof notes === 'string' ? notes.trim() || null : null,
            agencyId: aid,
            users: {
              create: {
                name: contactName.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: Role.CLIENT,
                agencyId: aid
              }
            }
          },
          include: { _count: { select: { projects: true } } }
        });

        await tx.activity.create({
          data: {
            type: 'client.created',
            message: `Client ${company.trim()} created with portal access`,
            agencyId: aid
          }
        });
        return client;
      });
      return res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      console.error('Create client error:', error);
      return res.status(500).json({ error: 'Failed to create client account' });
    }
  }
);

// Projects
app.get(
  '/api/projects',
  auth,
  agency,
  async (req: AuthReq, res: Response) => {
    const user = req.user!;
    const aid = tenant(user);

    if (!requireClientId(req, res)) return;

    const where: any = {
      agencyId: aid
    };

    if (user.role === 'CLIENT') {
      where.clientId = user.clientId!;
    }

    const rows = await db.project.findMany({
      where,
      include: {
        client: true,
        tasks: true,
        feedback: true,
        meetings: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(
      rows.map((p: any) => ({
        ...p,
        progress: p.tasks.length
          ? Math.round(
              p.tasks.filter(
                (t: any) => t.status === 'DONE'
              ).length /
                p.tasks.length *
                100
            )
          : 0,
        meetings: p.meetings.filter(
          (m: any) =>
            user.role !== 'CLIENT' || m.sharedWithClient
        )
      }))
    );
  }
);

app.post(
  '/api/projects',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN),
  async (req: AuthReq, res: Response) => {
    const {
      name,
      description,
      clientId,
      priority,
      dueDate
    } = req.body;

    const aid = tenant(req.user!);

    if (!name || !clientId) {
      return res.status(400).json({
        error: 'Project name and client are required'
      });
    }

    const c = await db.client.findFirst({
      where: {
        id: Number(clientId),
        agencyId: aid
      }
    });

    if (!c) {
      return res.status(400).json({
        error: 'Client does not belong to this agency'
      });
    }

    const p = await db.project.create({
      data: {
        name,
        description: description || '',
        clientId: c.id,
        agencyId: aid,
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });

    await db.activity.create({
      data: {
        type: 'project.created',
        message: `Project ${name} created`,
        agencyId: aid,
        projectId: p.id
      }
    });

    res.status(201).json(p);
  }
);

// Tasks
app.post(
  '/api/projects/:id/tasks',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const aid = tenant(req.user!);

    const p = await db.project.findFirst({
      where: {
        id: Number(req.params.id),
        agencyId: aid
      }
    });

    if (!p) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const {
      title,
      description,
      dueDate,
      priority
    } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Task title required'
      });
    }

    const t = await db.task.create({
      data: {
        title,
        description: description || '',
        projectId: p.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || 'MEDIUM'
      }
    });

    res.status(201).json(t);
  }
);

app.patch(
  '/api/tasks/:id',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const task = await db.task.findFirst({
      where: {
        id: Number(req.params.id),
        project: {
          agencyId: tenant(req.user!)
        }
      }
    });

    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    const data: any = {};

    for (const k of [
      'title',
      'description',
      'status',
      'priority'
    ] as const) {
      if (req.body[k] !== undefined) {
        data[k] = req.body[k];
      }
    }

    const updated = await db.task.update({
      where: { id: task.id },
      data
    });

    res.json(updated);
  }
);

// Feedback
app.post(
  '/api/projects/:id/feedback',
  auth,
  agency,
  roles(Role.CLIENT),
  async (req: AuthReq, res: Response) => {
    if (!requireClientId(req, res)) return;

    const p = await db.project.findFirst({
      where: {
        id: Number(req.params.id),
        agencyId: tenant(req.user!),
        clientId: req.user!.clientId!
      }
    });

    if (!p) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const {
      title,
      description
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: 'Title and description required'
      });
    }

    const f = await db.feedback.create({
      data: {
        title,
        description,
        projectId: p.id
      }
    });

    await db.activity.create({
      data: {
        type: 'feedback.submitted',
        message: `Feedback submitted: ${title}`,
        visibility: 'CLIENT',
        agencyId: tenant(req.user!),
        projectId: p.id
      }
    });

    res.status(201).json(f);
  }
);

app.get(
  '/api/feedback',
  auth,
  agency,
  async (req: AuthReq, res: Response) => {
    const user = req.user!;

    if (!requireClientId(req, res)) return;

    const clientScope =
      user.role === 'CLIENT'
        ? { clientId: user.clientId! }
        : {};

    const rows = await db.feedback.findMany({
      where: {
        project: {
          agencyId: tenant(user),
          ...clientScope
        }
      },
      include: {
        project: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(rows);
  }
);

app.patch(
  '/api/feedback/:id',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const f = await db.feedback.findFirst({
      where: {
        id: Number(req.params.id),
        project: {
          agencyId: tenant(req.user!)
        }
      }
    });

    if (!f) {
      return res.status(404).json({
        error: 'Feedback not found'
      });
    }

    const allowedStatuses = ['OPEN', 'IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DECLINED'];
    if (!allowedStatuses.includes(req.body?.status)) {
      return res.status(400).json({ error: 'Invalid feedback status' });
    }

    const updated = await db.feedback.update({
      where: { id: f.id },
      data: { status: req.body.status }
    });

    await db.activity.create({
      data: {
        type: 'feedback.status_updated',
        message: `Feedback "${f.title}" marked ${req.body.status.toLowerCase().replace('_', ' ')}`,
        agencyId: tenant(req.user!),
        projectId: f.projectId
      }
    });

    res.json(updated);
  }
);

// Agency team management
app.get(
  '/api/team',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const rows = await db.user.findMany({
      where: {
        agencyId: tenant(req.user!),
        role: { in: [Role.AGENCY_ADMIN, Role.AGENCY_TEAM] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(rows);
  }
);

app.post(
  '/api/team',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN),
  async (req: AuthReq, res: Response) => {
    const { name, email, password } = req.body || {};
    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' || password.length < 8
    ) {
      return res.status(400).json({
        error: 'Enter a name, valid email and password of at least 8 characters'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const created = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: await bcrypt.hash(password, 12),
        role: Role.AGENCY_TEAM,
        agencyId: tenant(req.user!)
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    });

    await db.activity.create({
      data: {
        type: 'team.member_created',
        message: `Team member ${created.name} added`,
        agencyId: tenant(req.user!)
      }
    });
    res.status(201).json(created);
  }
);

// Agency activity feed; clients only receive explicitly shared entries.
app.get(
  '/api/activities',
  auth,
  agency,
  async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!requireClientId(req, res)) return;
    const rows = await db.activity.findMany({
      where: {
        agencyId: tenant(user),
        ...(user.role === Role.CLIENT ? { visibility: 'CLIENT' } : {}),
        ...(req.query.projectId ? { projectId: Number(req.query.projectId) } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(rows);
  }
);

// Update project status without allowing cross-tenant project IDs.
app.patch(
  '/api/projects/:id/status',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const allowed = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];
    if (!allowed.includes(req.body?.status)) {
      return res.status(400).json({ error: 'Invalid project status' });
    }
    const project = await db.project.findFirst({
      where: { id: Number(req.params.id), agencyId: tenant(req.user!) }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const updated = await db.project.update({
      where: { id: project.id },
      data: { status: req.body.status }
    });
    await db.activity.create({
      data: {
        type: 'project.status_updated',
        message: `Project ${project.name} status changed to ${req.body.status}`,
        agencyId: tenant(req.user!),
        projectId: project.id
      }
    });
    res.json(updated);
  }
);

// Meetings
app.post(
  '/api/projects/:id/meetings',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const p = await db.project.findFirst({
      where: {
        id: Number(req.params.id),
        agencyId: tenant(req.user!)
      }
    });

    if (!p) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const m = await db.meeting.create({
      data: {
        title: req.body.title,
        notes: req.body.notes || '',
        date: new Date(req.body.date || Date.now()),
        sharedWithClient: !!req.body.sharedWithClient,
        projectId: p.id
      }
    });

    res.status(201).json(m);
  }
);

// AI project update
app.post(
  '/api/projects/:id/ai-update',
  auth,
  agency,
  roles(Role.AGENCY_ADMIN, Role.AGENCY_TEAM),
  async (req: AuthReq, res: Response) => {
    const p = await db.project.findFirst({
      where: {
        id: Number(req.params.id),
        agencyId: tenant(req.user!)
      },
      include: {
        tasks: true,
        feedback: true
      }
    });

    if (!p) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const context =
      `Project: ${p.name}; status: ${p.status}; tasks: ` +
      `${p.tasks.map((t: any) =>
        `${t.title} (${t.status}, due ${t.dueDate || 'unscheduled'})`
      ).join('; ')}; feedback: ` +
      `${p.feedback.map((f: any) =>
        `${f.title} (${f.status})`
      ).join('; ')}`;

    try {
      if (process.env.OPENAI_API_KEY) {
        const ai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });

        const out = await ai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Write a concise, professional client-facing project update. ' +
                'Do not invent facts; mention risks tactfully.'
            },
            {
              role: 'user',
              content: context
            }
          ]
        });

        return res.json({
          draft:
            out.choices[0]?.message?.content ||
            'Update unavailable',
          source: 'AI'
        });
      }
    } catch (e) {
      console.error('AI unavailable', e);
    }

    res.json({
      draft:
        `Hello, here is the latest update on ${p.name}. ` +
        `The project is currently ${p.status.toLowerCase().replace('_', ' ')}. ` +
        `${p.tasks.filter((t: any) => t.status === 'DONE').length} of ` +
        `${p.tasks.length} tasks are complete. ` +
        'We will continue to share progress and flag any items requiring your input.',
      source: 'Fallback draft'
    });
  }
);

// Error handler
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(err);

    res.status(500).json({
      error: 'Unexpected server error'
    });
  }
);

// Start server
const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`AgencyFlow API listening on ${port}`);
});