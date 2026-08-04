import sys
import os

# Add backend directory to python path for Vercel Serverless Function imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app
